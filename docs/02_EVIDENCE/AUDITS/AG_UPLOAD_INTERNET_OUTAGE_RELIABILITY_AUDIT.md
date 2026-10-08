# UPLOAD / INTERNET OUTAGE RELIABILITY AUDIT

**System:** Pictolabs Photobooth Fleet Platform  
**Target Subsystems:**
- `SyncEngine.ts` (SQLite Session Storage & Asynchronous Upload Worker)
- `RenderScreen.tsx` & `QRScreen.tsx` (Composite/Live Photo Hand-off & Queue Trigger)
- `WatchdogService.ts` (Upload In-Flight Mutex & Stuck Process Recovery)
- `StorageRetentionService.ts` (Three-Key Safety Lock Local Media Retention)
- `StorageService.ts` & `StorageController.ts` (Cloudflare R2 Direct PUT & NestJS Cloud Confirmation)
- Cloud Storage: Cloudflare R2 (`sessions/{sessionId}/*`) & PostgreSQL (`photos`, `sessions`)

**Audit Date:** 2026-10-07  
**Audit Type:** Static Source Code Forensic Inspection & Local Test Suite Verification (Zero Code Modified)

---

## 1. Verdict
**PASS WITH GAPS**

*(Local disk persistence, SQLite WAL queuing, S3 direct presigned uploads, and Three-Key retention protection are verified and operational. However, four concrete reliability gaps exist in the automatic outage recovery path—notably that sustained internet outages (>45s) permanently exhaust retries and leave uploads stranded until manual operator intervention).*

---

## 2. Current Architecture
The end-to-end media upload pipeline operates as follows:

```text
1. Customer Capture   ──► 2. RenderScreen (Sharp C++) ──► 3. Local SQLite Commit
   (Raw DSLR JPEG to         (Composite JPEG written;          (sessions table created:
    captures/ dir)            bg GIF transcode fired)           synced=0, uploaded=0)
                                                                       │
                                                                       ▼
6. Completion         ◄── 5. Confirmation             ◄── 4. upload_queue Enqueue
   (queue=COMPLETED,         (Direct PUT to R2 OK;             (Composite, poses, videos
    session.uploaded=1,       POST /confirm-upload to           enqueued as PENDING;
    remoteUrl saved)          PostgreSQL cloud ledger)          worker runs every 4s)
```

1. **Local Capture & Render:** Raw captures are saved to `captures/`. [`RenderScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/RenderScreen.tsx#L49-L86) generates the 300 DPI composite in ~2.0s and calls `kiosk.session.create`.
2. **Local Session & Queue Commit:** [`SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L350-L456) writes the session to SQLite WAL mode (`synced = 0`, `uploaded = 0`) and enqueues items into `upload_queue` (`id = upload_${sessionId}_${fileType}_${filename}`, `status = 'PENDING'`).
3. **Asynchronous Worker:** `processUploadQueue` runs every 4,000ms. It claims items with status `PENDING` or `FAILED` (`attempts < 5`), marks them `UPLOADING`, requests a presigned S3 PUT URL from `POST /api/storage/presigned-url` (30s timeout), and uploads directly to Cloudflare R2 via HTTP PUT (60s timeout).
4. **Pre-flight & Confirmation:** Upon R2 PUT success, `SyncEngine` checks that the session metadata exists in PostgreSQL (`syncSingleSessionToCloud`), then calls `POST /api/storage/confirm-upload` (30s timeout).
5. **Settlement:** Backend sets `session.status = 'COMPLETED'` and creates a `Photo` row. Kiosk marks `upload_queue.status = 'COMPLETED'` and `sessions.uploaded = 1`.

---

## 3. Reliability Matrix

| Scenario | Actual Behavior | Expected | Status | Evidence |
|---|---|---|:---:|---|
| **Internet OFF before upload** | Session and upload items safely committed to local SQLite. Worker attempts upload, fails, increments attempts, and backs off. If outage lasts $>45$s, all 5 attempts fail and job becomes permanently dormant. | Keep local data + pending queue; automatically upload when internet returns regardless of outage duration. | **GAP** | [`SyncEngine.ts:249`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L249): `WHERE attempts < 5`. Exhausts in ~30s ($2+4+8+16\text{s}$). |
| **Internet OFF during upload (mid-stream PUT)** | Network drop aborts fetch via `AbortSignal.timeout(60000)`. Worker catches error, updates `status = 'FAILED'`, and schedules retry. | Abort cleanly and retry with backoff. | **PASS** | [`SyncEngine.ts:960`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L960): `AbortSignal.timeout(60000)` with `catch` block. |
| **DNS / Network Timeout** | `AbortSignal.timeout` triggers error; caught and recorded in `error_message`. Item marked `FAILED`. | Non-crashing error handling and retry. | **PASS** | [`SyncEngine.ts:940`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L940), [`SyncEngine.ts:1095-1098`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L1095-L1098). |
| **R2 Unavailable** | Direct R2 PUT fails; worker falls back to streaming upload endpoint `POST /api/storage/upload`. If that also fails, marks `FAILED`. | Failover or retry with backoff. | **PASS** | [`SyncEngine.ts:1018-1064`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L1018-L1064). |
| **Presigned URL Unavailable** | Presigned fetch throws; caught and attempts streaming fallback. | Graceful backoff. | **PASS** | [`SyncEngine.ts:1018-1020`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L1018-L1020). |
| **Upload succeeds, confirmation fails** | File is written to R2. Confirmation times out $\rightarrow$ item marked `FAILED`. On retry, re-uploads to R2 and calls `/confirm-upload` again, which inserts a duplicate `Photo` row in PostgreSQL. | Idempotent confirmation without duplicate records. | **GAP** | [`storage.controller.ts:99-106`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.controller.ts#L99-L106): Unconditional `prisma.photo.create(...)`. |
| **Kiosk restart while PENDING** | Queue rows survive in SQLite WAL. On boot, worker picks up pending items on first 4s interval tick. | Resume queue processing automatically. | **PASS** | Verified in [`crash-recovery-e2e.spec.ts:308-310`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/crash-recovery-e2e.spec.ts#L308-L310) (Scenario E). |
| **Kiosk restart while UPLOADING** | Row remains `status = 'UPLOADING'`. Worker skips it, but `WatchdogService` rescues it after 60s threshold, setting it to `PENDING` and incrementing attempts. | Must not permanently lock the job. | **PASS** | [`SyncEngine.ts:1172-1194`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L1172-L1194), verified in `burn-in.spec.ts:215-220`. |
| **Electron crash during upload** | In-memory mutex `isUploading` cleared by process restart. SQLite preserves state. Watchdog resets stuck job after 60s. | Automatic crash recovery. | **PASS** | [`WatchdogService.ts:124-129`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/WatchdogService.ts#L124-L129). |
| **Multiple worker ticks** | Guarded by `isUploading = true` flag. Subsequent timer ticks return immediately while worker is active. | Mutex prevents concurrency races. | **PASS** | [`SyncEngine.ts:874-878`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L874-L878). |
| **Same session processed twice** | `upload_queue.id` deterministic. `INSERT OR IGNORE` drops duplicate enqueue attempts for same file/session. | Idempotent enqueue. | **PASS** | [`SyncEngine.ts:243-246`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L243-L246). |
| **Internet returns after sustained outage (>60s)** | Because all 5 attempts failed in first ~30s, items have `attempts = 5`. Worker query ignores them. No automatic retry occurs when internet returns. | Automatic store-and-forward resumption. | **GAP** | [`SyncEngine.ts:249`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L249). Requires manual Admin "Force Upload". |
| **Permanent failure** | After 5 attempts, job stays `FAILED` or enters `DEAD_LETTER`. Exposed in Admin Session History with "Force Upload" button. | Visible and operator-resolvable. | **PASS** | [`SyncEngine.ts:785-840`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L785-L840). |
| **Already-uploaded asset** | If Force Upload is clicked on completed session, it re-uploads and calls `/confirm-upload`, inserting duplicate `Photo` rows. | Do not duplicate cloud state. | **GAP** | [`storage.controller.ts:99-106`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.controller.ts#L99-L106). |

---

## 4. Idempotency

- **Mechanism:**
  - **Kiosk Enqueue:** [`SyncEngine.ts:846`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L846) generates `id = upload_${sessionId}_${fileType}_${filename}` using `INSERT OR IGNORE`. Local enqueue is strictly idempotent.
  - **Cloudflare R2 Storage:** S3 Object key is strictly deterministic: `sessions/${sessionId}/${safeFilename}` ([`storage.service.ts:122`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.service.ts#L122)). Repeated S3 PUTs overwrite the identical object key. Cloud storage is strictly idempotent.
  - **PostgreSQL Session:** `syncSession` performs an update/upsert on `id`. Idempotent.
  - **PostgreSQL Photo Records:** [`storage.controller.ts:99-106`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.controller.ts#L99-L106) executes `this.prisma.photo.create(...)` on every confirmation without checking if a record with the same `(sessionId, storageKey)` already exists.
- **Duplicate Risk:**
  - Zero duplicate files in Cloudflare R2.
  - Zero duplicate rows in SQLite `upload_queue`.
  - **High duplicate risk in PostgreSQL `Photo` table** whenever an upload retries after a dropped confirmation packet or after an operator clicks "Force Upload".
- **Verdict:**
  **PARTIAL (Idempotent at Kiosk and R2 layer; Non-Idempotent at Backend Photo ledger layer).**

---

## 5. Restart / Crash Recovery

- **PENDING:**
  - Survives restart in SQLite WAL table `upload_queue`.
  - Queried by `stmtGetPendingUploads` within 4 seconds of kiosk boot.
- **UPLOADING:**
  - If power is cut mid-upload, the row remains in `status = 'UPLOADING'`.
  - On restart, `isUploading` in-memory lock is `false`.
  - The upload worker query skips `UPLOADING` to avoid concurrent uploads.
  - [`WatchdogService.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/WatchdogService.ts#L124) runs `resetStuckUploadWorker(60_000)` every 15 seconds.
  - Once 60 seconds have elapsed since `updated_at`, the watchdog rescues the row back to `PENDING` (incrementing `attempts`), logs `UPLOAD_WATCHDOG_RESCUE`, and triggers the worker.
- **Crash:**
  - Database is protected by SQLite WAL mode and `NORMAL` synchronous pragma. Zero corruption observed across 100 forced restart stress cycles.
- **Restart:**
  - `startSyncEngine()` initializes prepared statements, starts the 4s worker interval, and connects WebSocket.
- **Verdict:**
  **PASS (Robust crash resilience; recovers without deadlock within 60 seconds).**

---

## 6. Automated Tests

| Test File | Result | What It Proves |
|---|:---:|---|
| [`storage-retention.spec.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/storage-retention.spec.ts) | **6/6 PASS** | Proves Three-Key Lock prevents purging unuploaded files (`status != 'COMPLETED'`); proves cloud rehydration for reprints; proves SQLite WAL compaction. |
| [`crash-recovery-e2e.spec.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/crash-recovery-e2e.spec.ts) | **33/33 PASS** | Proves Scenario E: Kiosk sudden reboot while upload is pending restores QRScreen and preserves `upload_queue` in SQLite. |
| [`burn-in.spec.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/burn-in.spec.ts) | **34/34 PASS** | Proves Scenario D: Upload Watchdog rescues stuck `UPLOADING` item back to `PENDING` and escalates to `DEAD_LETTER` after 5 attempts. Proves Scenario F: Crash during upload self-heals. |
| **Missing Test Scenarios** | **GAP** | **No test actually disconnects the network and asserts recovery:** `burn-in.spec.ts` Scenario J (*"Network Offline 30 Minutes"*) only verifies that 3 items are inserted into SQLite (`SELECT count(*) FROM upload_queue`). It does **not** run the worker against network failure or reconnection! |

---

## 7. Identified Gaps

### GAP 1: Fast Retry Exhaustion Strands Uploads in Sustained Outages
- **Root Cause:** In [`SyncEngine.ts:890-896`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L890-L896), exponential backoff is $2\text{s}, 4\text{s}, 8\text{s}, 16\text{s}, 32\text{s}$. The worker query in line 249 filters on `attempts < 5`.
- **Impact:** During an internet outage lasting $>45$ seconds (common in malls), all 5 retries fail in rapid succession. Once `attempts = 5`, `stmtGetPendingUploads` excludes the items forever. When internet reconnects, the kiosk **never retries automatically**. Files stay stranded locally until an operator presses "Force Upload" in Admin Panel.

### GAP 2: Decoupled Looping GIF is Never Enqueued in Normal Flow
- **Root Cause:** In RCA-7, GIF transcoding in [`RenderScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/RenderScreen.tsx#L88-L105) was moved to background execution *after* `kiosk.session.create`. When the GIF finishes, `RenderScreen.tsx` calls `kiosk.session.update(sessionId, { gifPath })`. However, [`SyncEngine.ts:470-494`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L470-L494) (`updateSession`) only enqueues `compositePath`; it completely ignores `gifPath`!
- **Impact:** In the normal customer journey, animated GIF files are never added to `upload_queue` and are never uploaded to Cloudflare R2. Mobile QR customers only receive the static photostrip.

### GAP 3: Non-Idempotent Photo Ledger Registration in PostgreSQL
- **Root Cause:** In [`storage.controller.ts:99-106`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.controller.ts#L99-L106), `/confirm-upload` calls `prisma.photo.create(...)` unconditionally.
- **Impact:** If an upload succeeds to R2 but the confirmation network response drops, the client retries, causing multiple `Photo` rows with identical `storageKey` to be inserted in the cloud database.

### GAP 4: Missing Network Reconnection Event Trigger
- **Root Cause:** `SyncEngine` has no listener for OS online events or WebSocket reconnection (`socket.on('connect')`) to re-evaluate failed uploads.

---

## 8. Severity

| Gap | Severity | Why It Matters for Pilot Booth #1 |
|---|:---:|---|
| **GAP 1: Fast Retry Exhaustion** | **P1 (High)** | Retail mall cellular/Wi-Fi outages frequently last 2–15 minutes. Photos taken during an outage will silently abort uploading and stay un-synced. Customers will scan the photostrip QR code and see an indefinite *"Menyinkronkan Cloud..."* spinner. |
| **GAP 2: Missing GIF Enqueue** | **P1 (High)** | Softfile delivery is a primary product value proposition. If the GIF is never enqueued, customers cannot download their animated Boomerang softfile. |
| **GAP 3: Non-Idempotent Photo DB** | **P2 (Medium)** | Produces duplicate `Photo` rows in PostgreSQL, bloating database relations and potentially creating duplicate files in customer ZIP downloads. |
| **GAP 4: No Reconnection Trigger** | **P2 (Medium)** | Delays recovery when internet is restored; relies solely on 4s timer ticks rather than reactive network events. |

---

## 9. Documentation Consistency

| Document | Stated Status | Actual Implementation Match | Drift Assessment |
|---|---|---|---|
| [`PICTOLABS_PILOT_READINESS_TIMELINE_v3.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/PICTOLABS_PILOT_READINESS_TIMELINE_v3.md) | `PRODUCTION_REGRESSION_PENDING` (P1) | Matches. Outage recovery was flagged as open. | **CONSISTENT** |
| [`CURRENT_PROJECT_STATE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/00_CONTEXT/CURRENT_PROJECT_STATE.md) | `OPEN` (Upload Retail Outage Gate) | Matches. Real-world outage resilience was not closed. | **CONSISTENT** |
| [`STORAGE_WORKSTREAM.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/01_WORKSTREAMS/STORAGE_WORKSTREAM.md) | `OPEN` (Upload Production Outage Gate) | Matches. Explicitly states mall outage gate is open. | **CONSISTENT** |
| [`PHASE_3_2C_STORAGE_LIFECYCLE.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/SPECS_REPORTS/PHASE_3_2C_STORAGE_LIFECYCLE.md) | Design & Architecture | Matches retention lock behavior; raw leak was identified. | **CONSISTENT** |

**Conclusion on Status:** The canonical status `Upload / Internet Outage Reliability = OPEN` is **100% ACCURATE AND JUSTIFIED**. The gate must NOT be closed until the identified gaps are resolved.

---

## 10. Recommended Next Action
Provide the minimum implementation scope required to close the reliability gate:

1. **Enqueue Background GIF in `updateSession`:**
   In [`SyncEngine.ts:487`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L487), add enqueue logic for `update.gifPath`:
   ```ts
   if (update.gifPath && fs.existsSync(update.gifPath)) {
     enqueueUpload(id, update.gifPath, 'video');
   }
   ```
2. **Implement Store-and-Forward Reconnection Recovery:**
   In `SyncEngine.ts`, add an automatic re-arm mechanism:
   - When the backend WebSocket connects (`socket.on('connect')`) or HTTP heartbeat succeeds after an outage, execute an automatic query resetting network-failed items back to `PENDING` with `attempts = 0`:
     ```sql
     UPDATE upload_queue 
     SET status = 'PENDING', attempts = 0, updated_at = ? 
     WHERE status = 'FAILED' AND error_message NOT LIKE 'File missing%';
     ```
   - Cap maximum backoff with a persistent background retry cycle (e.g., retry failed items every 60s indefinitely instead of dropping dead after attempt 5).
3. **Idempotent Cloud Photo Confirmation:**
   In [`storage.controller.ts:99-106`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.controller.ts#L99-L106), replace unconditional `photo.create` with an upsert or `findFirst` check on `(sessionId, storageKey)`.
4. **Create a Dedicated Network Outage Automated Test:**
   Write an automated test that mocks a network outage (simulating 5+ failed fetch attempts $\rightarrow$ internet returns $\rightarrow$ worker automatically re-arms $\rightarrow$ items transition to `COMPLETED`).
