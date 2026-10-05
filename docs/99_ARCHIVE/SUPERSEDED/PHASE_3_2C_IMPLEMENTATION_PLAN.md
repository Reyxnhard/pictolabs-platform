# Pictolabs Phase 3.2C — Implementation Plan: Storage Lifecycle & Dual-Tier Retention Engine

**Document Version:** 1.0.0  
**Target Module:** Phase 3.2C — Storage Lifecycle & Retention Engine  
**Target Platform:** Windows 10/11 64-bit Kiosk (Electron Client) & Cloudflare R2 / PostgreSQL  
**Execution Gate:** Requires Architecture & Plan Approval before any code modification  

---

## 1. Overview & Problem Statement

Phase 3.2C transforms the existing incomplete and leaky local storage handling into an enterprise-grade, deterministic **Storage Retention & Disk Quota Engine**.

### Current Deficiencies:
1. Raw DSLR captures in `DATA_DIR/captures/` and transient countdown clips in `DATA_DIR/videos/*.webm` are unreferenced by `upload_queue`, causing `StorageRetentionService` to permanently skip them.
2. `StorageRetentionService` checks ONLY `upload_queue.status === 'COMPLETED'`. It fails to cross-reference `print_queue`, which risks premature deletion of print assets during emergency low-disk purges.
3. No automated cleanup exists for retake discards when customers re-shoot poses.
4. Reprints fail if an old composite has already been deleted from disk, even though the file is safely stored in Cloudflare R2.

---

## 2. Target Files & Scope of Changes

| Target File | Change Type | Responsibilities & Exact Modifications |
|---|---|---|
| `apps/kiosk/electron/services/StorageRetentionService.ts` | **REFACTOR / ENHANCE** | 1. Implement **Three-Key Safety Lock**: Check both `upload_queue` AND `print_queue` before any file unlink.<br>2. Implement **Orphan Janitor**: Scan and purge untracked transient `.webm` and discarded captures older than 2 hours.<br>3. Implement **Priority Waterfall**: Emergency low-disk purge (<5GB) targeting oldest completed raw photos, then videos, then composites older than 48h.<br>4. Implement **Database Row Compaction**: Run `VACUUM` and `wal_checkpoint(TRUNCATE)` safely during daily maintenance. |
| `apps/kiosk/electron/services/LivePhotoService.ts` | **MODIFY** | 1. Unlink transient `livephoto_*_pose_*.webm` immediately after successful MP4 transcoding.<br>2. In `finalizeSessionLivePhotos`, ensure only verified output paths are tracked.<br>3. Export helper `cleanupTransientVideoFiles(sessionId)` for aborted/retaken sessions. |
| `apps/kiosk/electron/services/CameraService.ts` | **MODIFY** | 1. Return both `dataUrl` and `filePath` in `camera:capture` so the exact file path is tracked.<br>2. Add tracking metadata or direct naming `capture_<sessionId>_pose_<n>.jpg` to eliminate orphan shadow files.<br>3. Provide IPC method `camera:discard-capture(filePath)` when customer clicks "Retake". |
| `apps/kiosk/electron/services/SyncEngine.ts` | **MODIFY** | 1. Eliminate double-copying of raw photos (ingest camera files directly into session records).<br>2. Update `getUploadQueueItemByPath` to index exact normalized paths.<br>3. Add helper `getPrintQueueItemByPath(filePath)` or cross-query helper.<br>4. Add schema index `idx_upload_queue_path` and `idx_print_queue_path` for sub-millisecond retention lookups. |
| `apps/kiosk/electron/services/PrintQueueService.ts` | **MODIFY** | 1. In `reprintSession(sessionId)`, if local composite does not exist on disk, stream and rehydrate it from `sessions.remote_url` (Cloudflare R2) before printing.<br>2. Export `isPrintAssetLocked(filePath)` to feed Key 3 of the retention lock. |
| `apps/kiosk/src/screens/CaptureScreen.tsx` | **MODIFY** | When `handleRetake()` is clicked, notify IPC to immediately unlink/quarantine the discarded photo file from disk instead of leaving it stranded. |
| `apps/kiosk/electron/services/storage-retention.spec.ts` | **NEW TEST** | Deterministic automated unit and integration tests verifying all 3 keys, low-disk waterfall, transient cleanup, and R2 rehydration. |

---

## 3. Database Schema & Migration Impact

### 3.1 SQLite Schema Enhancements (`kiosk.db`)

Add performance indexes on file paths in `upload_queue` and `print_queue` to ensure the daily retention daemon can scan 1,000+ files without table scans:

```sql
-- Migration: Phase 3.2C Storage Lifecycle Indexes
CREATE INDEX IF NOT EXISTS idx_upload_queue_file_path ON upload_queue(file_path);
CREATE INDEX IF NOT EXISTS idx_print_queue_file_path ON print_queue(file_path);

-- Add local_storage_state column to sessions to indicate if media files are locally present or pruned
ALTER TABLE sessions ADD COLUMN local_storage_state TEXT NOT NULL DEFAULT 'HOT'; 
-- Values: 'HOT' (0-48h all local), 'WARM' (48h-7d), 'PRUNED' (files deleted locally, safely in R2)
```

### 3.2 Migration Strategy
- Migrations are non-destructive and idempotent (`IF NOT EXISTS` / `try-catch ALTER TABLE`).
- Existing sessions in SQLite automatically default to `local_storage_state = 'HOT'`.
- Zero impact on PostgreSQL cloud schema (cloud already stores immutable `Photo` and `Session` records).

---

## 4. Detailed Component Implementation

### 4.1 Three-Key Safety Lock in `StorageRetentionService.ts`

```typescript
export interface CanPurgeResult {
  canPurge: boolean;
  reason?: string;
  keys: {
    key1_ttlPassed: boolean;
    key2_cloudUploaded: boolean;
    key3_printSettled: boolean;
  };
}

export function evaluateThreeKeyLock(
  fullPath: string,
  stat: fs.Stats,
  options: StorageRetentionOptions
): CanPurgeResult {
  const now = Date.now();
  const fileAgeMs = now - stat.mtimeMs;
  const retentionMs = (options.retentionDays ?? 7) * 24 * 60 * 60 * 1000;

  // Key 1: Operational TTL
  const key1_ttlPassed = fileAgeMs >= retentionMs;

  // Key 2: Confirmed Cloud Upload
  const uploadItem = getUploadQueueItemByPath(fullPath);
  const key2_cloudUploaded = uploadItem?.status === 'COMPLETED';

  // Key 3: Print Queue Settlement
  const isPrintAsset = isPrintQueueAsset(fullPath);
  const isPrintLocked = isPrintAsset && isPrintJobPendingOrPrinting(fullPath);
  const key3_printSettled = !isPrintLocked;

  const canPurge = key1_ttlPassed && key2_cloudUploaded && key3_printSettled;

  return {
    canPurge,
    reason: !canPurge
      ? `Locked by: ${[!key1_ttlPassed && 'KEY1(Age)', !key2_cloudUploaded && 'KEY2(Upload)', !key3_printSettled && 'KEY3(Print)'].filter(Boolean).join(', ')}`
      : 'All 3 keys unlocked',
    keys: { key1_ttlPassed, key2_cloudUploaded, key3_printSettled },
  };
}
```

### 4.2 Immediate Transient Cleanup in `LivePhotoService.ts`

```typescript
// After ffmpeg successfully transcodes webmPath into mp4Path:
if (fs.existsSync(mp4Path) && fs.statSync(mp4Path).size > 1024) {
  try {
    fs.unlinkSync(webmPath);
    console.log(`[LivePhotoService] ✓ Transcoded & unlinked transient WebM: ${path.basename(webmPath)}`);
  } catch (err) {
    console.warn(`[LivePhotoService] Failed unlinking transient WebM:`, err);
  }
}
```

### 4.3 Cloud Rehydration in `PrintQueueService.ts`

```typescript
export async function ensureCompositeOnDisk(sessionId: string, filePath: string): Promise<string | null> {
  const cleanPath = filePath.replace(/^file:\/\/\/?/, '');
  if (fs.existsSync(cleanPath)) {
    return cleanPath;
  }

  // File was pruned! Rehydrate from Cloudflare R2
  console.log(`[PrintQueueService] Local composite was pruned. Rehydrating session ${sessionId} from Cloudflare R2...`);
  const db = getDatabase();
  const session = db?.prepare('SELECT remote_url FROM sessions WHERE id = ?').get(sessionId) as any;
  if (!session?.remote_url) {
    return null;
  }

  const res = await fetch(session.remote_url);
  if (!res.ok) throw new Error(`Failed to download from R2: HTTP ${res.status}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const dir = path.dirname(cleanPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(cleanPath, buffer);
  console.log(`[PrintQueueService] ✓ Rehydrated composite from R2: ${cleanPath} (${buffer.length} bytes)`);
  return cleanPath;
}
```

---

## 5. Risk Analysis & Mitigation Strategies

| Risk Identified | Severity | Mitigation Strategy |
|---|---|---|
| **Accidental Deletion of In-Flight Photo** | **CRITICAL** | Key 2 enforces `upload_queue.status === 'COMPLETED'`. If upload has failed, is pending, or is untracked, file is 100% preserved. |
| **Deleting Composite While Print Stalled** | **HIGH** | Key 3 queries `print_queue`. If a job is `PENDING`, `PRINTING`, or within exponential retry backoff, deletion is strictly blocked. |
| **Windows Locked File Error (EBUSY / EPERM)** | **MODERATE** | File unlink is wrapped in `try-catch`. If locked by Windows spooler or preview, it is skipped and logged for the next cycle without crashing. |
| **Offline Kiosk Unable to Rehydrate** | **LOW** | Hot tier guarantees all files are preserved locally for at least 48h to 7d. Rehydration is only invoked for old archived reprints (>7 days). |
| **Orphan Accumulation from Crashes** | **MODERATE** | Startup janitor scans `DATA_DIR` for temporary files (`*.tmp`, `*_concat.txt`, orphaned `.webm`) older than 2 hours and unlinks them. |

---

## 6. Rollback Plan

If any regression occurs during Phase 3.2C deployment:
1. **Disable Retention Daemon via Flag**: In `kiosk-config.json`, set `"enableStorageRetention": false`. The daemon will immediately stop scheduled purges.
2. **Revert Binary / Code**: Revert `StorageRetentionService.ts` and `SyncEngine.ts` to their Phase 3.2B baseline.
3. **Database Backwards Compatibility**: The added columns (`local_storage_state`) and indexes have zero breaking effects on existing queries; no table rebuilds are required.

---

## 7. Verification & Testing Plan

### Automated Test Suite (`storage-retention.spec.ts`)

1. **Test 1: Three-Key Lock Enforcement**
   - File age > 7 days, but `upload_queue = PENDING` $\rightarrow$ File is **PRESERVED** (PASS).
   - File age > 7 days, `upload_queue = COMPLETED`, but `print_queue = PRINTING` $\rightarrow$ File is **PRESERVED** (PASS).
   - File age > 7 days, `upload_queue = COMPLETED`, and `print_queue = COMPLETED` $\rightarrow$ File is **PURGED** (PASS).
2. **Test 2: Transient WebM Cleanup**
   - Pose countdown recorded $\rightarrow$ MP4 generated $\rightarrow$ Source `.webm` verified unlinked from disk in < 500ms (PASS).
3. **Test 3: Retake Discard Cleanup**
   - Shutter clicked $\rightarrow$ Customer clicks "Retake" $\rightarrow$ Discarded capture file unlinked immediately without entering upload queue (PASS).
4. **Test 4: Emergency Low Disk Purge (< 5GB)**
   - Mock disk free = 3.5 GB $\rightarrow$ Daemon purges oldest completed raw photos (>48h) until disk free >= 5.0 GB $\rightarrow$ In-flight and pending print jobs untouched (PASS).
5. **Test 5: Cloud Rehydration for Reprints**
   - Composite manually removed from disk $\rightarrow$ `reprintSession()` triggers rehydration from cloud URL $\rightarrow$ File re-downloaded, verified, and sent to printer (PASS).
6. **Test 6: Windows File Lock Tolerance**
   - Mock file lock throwing `EBUSY` $\rightarrow$ Daemon skips file, records warning, finishes remaining files without crashing (PASS).
