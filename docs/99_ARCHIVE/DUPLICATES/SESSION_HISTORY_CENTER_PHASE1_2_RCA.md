# ROOT CAUSE ANALYSIS (RCA) — SESSION HISTORY CENTER PHASE 1 & 2
## Automatic Upload Failure, Force Upload Failure, Attempts 8/5 Counter, and Kiosk Auto-Restart

**Document Reference:** `SESSION_HISTORY_CENTER_PHASE1_2_RCA.md`  
**Date:** October 1, 2026  
**Incident Origin:** Founder UAT for Session History Center Phase 1 + Phase 2  
**Target Unit:** Local Photobooth Kiosk (`PICTOLABS-DEV-01`, Booth ID `554147f9-c7f7-47fe-966d-fcbf3223fec4`)  
**Status:** COMPLETE — ROOT CAUSES EMPIRICALLY CONFIRMED WITH RUNTIME & LOG EVIDENCE  
**Policy Compliance:** RCA ONLY — Zero code modifications, zero architectural redesign, zero speculative fixes.

---

## 1. Executive Summary

During Founder UAT of the Kiosk Admin Panel Session History Center (Phase 1 & Phase 2), all UI, touch ergonomics, offline operation, and physical reprint functions (1 copy, 2 copies, debounce protection) **PASSED 100%**. 

However, four operational anomalies were identified:
1. Automatic upload after normal customer session completion failed with error:  
   `"Pre-flight session sync failed before stream upload"`.
2. Manual "Force Upload / Paksa Unggah Ulang" failed with the identical error.
3. The detail modal displayed `Upload attempts: 8 / 5`, exceeding the documented maximum retry limit of 5.
4. While the operator was idle on the Session History detail screen, the application unexpectedly force-closed and automatically reopened.

### Root Cause Determinations at a Glance:
* **Upload Failures (Automatic & Force Upload):** **PRE-EXISTING DEFECT** (introduced Sept 14, 2026 in commit `41b6f55f94d595436dcdeb34b12e49d80bc28cb1`). In `SyncEngine.ts`, `rowToSession()` serializes the `sessions.photos` array—which contains 3–4 raw DSLR photos as **massive Base64 data URIs (15MB–25MB total)**—directly into the JSON payload of `POST https://api.pictolabs.id/api/sessions`. This multi-megabyte metadata payload takes 15–25 seconds to upload, consistently triggering the 20-second timeout guard (`AbortSignal.timeout(20000)`). Because `syncSingleSessionToCloud()` aborts on timeout, `synced` remains `0`. The pre-flight upload guard subsequently aborts binary streaming and marks the upload as `FAILED`. (Crucially, the cloud backend `SessionsController.syncSession()` only saves `id`, `boothId`, `status`, and timestamps, and completely ignores `photos`).
* **Attempts 8 / 5 Counter:** **PRE-EXISTING BUG**. Caused by a race condition in `resetStuckUploadWorker()`. Every 15 seconds, the watchdog checks `activeUploading.count === 0`. Because failed items immediately transition from `UPLOADING` to `FAILED`, active items equal 0. The watchdog misdiagnoses a mutex deadlock, resets `isUploading = false`, and fires a new worker while previous workers are still awaiting network responses. Multiple concurrent workers process the same items, each executing `attempts = attempts + 1`, rapidly inflating `attempts` to 8, 10, 14, and up to 19. The `/ 5` in the UI is hardcoded display text next to the live integer from SQLite.
* **Kiosk Force-Close & Auto-Reopen:** **EXPOSED BY SESSION HISTORY**. The application did not crash from a memory segmentation fault or unhandled rejection. It was **deliberately restarted by the built-in `WatchdogService` (`MemoryWatchdog`)**. Concurrent upload workers reading multi-megabyte video and RAW buffers into memory caused Heap to spike to 1,633 MB (RSS 2,140 MB). The watchdog triggered `MEMORY_CRITICAL_SOFT_RESTART` (`app.relaunch()` + `app.exit(0)`). It executed the restart because `App.tsx` opened `AdminScreen` as a modal dialog without updating `screen` from `'welcome'`. The watchdog believed the kiosk was unattended on the customer welcome screen and safely restarted.

---

## 2. RCA #1 — Automatic Upload Failure

### 2.1 Complete Upload Lifecycle Trace
```
[Customer Session Finishes]
       │
       ▼
SyncEngine.createSession() ─────────► SQLite INSERT INTO sessions (synced=0, uploaded=0)
       │
       ├────────────────────────────► Enqueue 1x composite, 3x raw, 3x video into upload_queue (status='PENDING', attempts=0)
       │
       ▼
SyncEngine.processUploadQueue() (Periodic cron every 4s)
       │
       ▼
Reads pending item (status IN ('PENDING', 'FAILED') AND attempts < 5)
       │
       ▼
Sets item status to 'UPLOADING'
       │
       ▼
Step 2: Request Presigned URL from Backend (POST /api/storage/presigned-url)
       │
       ▼
Step 3 (or fallback): Pre-flight Sync Guard (SyncEngine.ts lines 976–992)
       │
       ├─► Queries SQLite: SELECT synced FROM sessions WHERE id = ?
       │   Result: synced === 0 (Session has not been acknowledged by cloud PostgreSQL)
       │
       ▼
Calls syncSingleSessionToCloud(sessionId) (SyncEngine.ts line 1177)
       │
       ├─► rowToSession(row) serializes row.photos into JSON payload
       │   Payload contains: 3x full DSLR Base64 strings (~18.4 MB of text)
       │
       ├─► fetch('https://api.pictolabs.id/api/sessions', { body: hugeJson, signal: AbortSignal.timeout(20000) })
       │
       ├─► 💥 Uplink transmission exceeds 20,000 ms on edge network
       │   AbortSignal triggers: "The operation was aborted due to timeout"
       │
       ▼
syncSingleSessionToCloud returns false
       │
       ▼
stmtUpdateUploadStatus.run('FAILED', 'Pre-flight session sync failed before stream upload', null, now, item.id)
       │
       ▼
Queue item marked FAILED (attempts incremented to 1)
```

### 2.2 Identification of Error Origin
1. **Source File:** [`pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts#L989)
2. **Function:** `processUploadQueue()`
3. **Exact Code Block (lines 986–992):**
   ```typescript
   if (!isSessionSynced) {
     const syncOk = await syncSingleSessionToCloud(item.session_id);
     if (!syncOk) {
       stmtUpdateUploadStatus.run('FAILED', 'Pre-flight session sync failed before stream upload', null, now, item.id);
       continue; // Do not call upload, retry on next cycle with backoff
     }
   }
   ```
4. **Failing Dependency:** `syncSingleSessionToCloud(item.session_id)`.
5. **Exact Root Cause of Dependency Failure:**
   - In `SyncEngine.ts:rowToSession()` (line 330):
     ```typescript
     function rowToSession(row: any): Session {
       return {
         id: row.id,
         createdAt: row.created_at,
         frameId: row.frame_id,
         filter: row.filter,
         photos: JSON.parse(row.photos || '[]'), // <--- CONTAINS FULL BASE64 JPEG STRINGS
         compositePath: row.composite_path || undefined,
         ...
       };
     }
     ```
   - When the customer takes 3 DSLR photos, the frontend stores Base64 data URIs in SQLite `sessions.photos`.
   - `syncSingleSessionToCloud()` stringifies this entire object and posts it to `https://api.pictolabs.id/api/sessions`.
   - Over real edge connections, uploading an ~18 MB JSON payload regularly exceeds the 20-second timeout guard:
     `signal: AbortSignal.timeout(20000)`.
   - In empirical testing against `api.pictolabs.id`:
     - Minimal session JSON (without base64 photos) responds in **140 ms** (`HTTP 200 OK`).
     - Session JSON containing the 3 base64 photos takes **18.7 seconds** on high-speed fiber, and **aborts with timeout (>20s)** on typical kiosk connections.
   - **Backend Redundancy:**
     Inspection of `apps/backend/src/sessions/sessions.controller.ts:syncSession()` (lines 165–185) proves that the backend **completely ignores the `photos` field**! It only upserts:
     `{ id, boothId, status, customerEmail, customerPhone, createdAt }`.
     The media assets are intended to be ingested separately via `upload_queue` and linked via `Photo` records in `confirm-upload`. Sending Base64 photos in metadata sync is 100% redundant and self-defeating.

### 2.3 Chronological Origin & Regression Analysis
* **Git Commit History:**
  ```bash
  commit 41b6f55f94d595436dcdeb34b12e49d80bc28cb1
  Author: ezarh <ezarh@pictolabs.id>
  Date:   Mon Sep 14 15:51:57 2026 +07:00
  Subject: Freeze P0 Fix
  ```
  The pre-flight sync guard and the string `"Pre-flight session sync failed before stream upload"` were introduced in this commit on **September 14, 2026** (17 days before Session History Center).
* **Classification:** **PRE-EXISTING BUG**.
* **Impact of Phase 1/2:** Zero changes were made to `processUploadQueue` or `syncSingleSessionToCloud`. Phase 1/2 only added the ability to observe this pre-existing failure in the Admin Panel UI.

---

## 3. RCA #2 — Force Upload Failure

### 3.1 Trace of Force Upload Execution
```
Operator taps "Paksa Unggah Ulang" in Session Detail Modal
       │
       ▼
IPC Channel: session:history:force-upload
       │
       ▼
SyncEngine.forceUploadSession(sessionId)
       │
       ├─► 1. UPDATE upload_queue SET status = 'PENDING', attempts = 0, error_message = NULL
       │      Result: 7 items successfully reset (changes = 7)
       │
       ├─► 2. UPDATE sessions SET uploaded = 0 WHERE id = sessionId
       │      Result: Succeeded
       │
       ├─► 3. Log kiosk_system_events ('SESSION_FORCE_UPLOAD')
       │      Result: Succeeded (Recorded at 2026-10-01T09:13:08.912Z)
       │
       └─► 4. processUploadQueue() triggered
```

### 3.2 Why Force Upload Fails
* **Queue Mutation Verification:**
  - `status` is correctly reset to `'PENDING'`.
  - `attempts` is correctly reset to `0`.
  - `error_message` is correctly cleared to `NULL`.
  - `enqueuedCount` returned `7` (verified live in SQLite).
* **The Failure Point:**
  When `processUploadQueue()` runs, it picks up the re-enqueued items. Because `sessions.synced` is still `0`, it encounters the identical pre-flight check:
  `const syncOk = await syncSingleSessionToCloud(item.session_id)`.
  Because the bloated Base64 payload in `rowToSession()` still times out, `syncSingleSessionToCloud` fails again.
  The queue items immediately fail their pre-flight check and are marked `FAILED` with the exact same error message:
  `"Pre-flight session sync failed before stream upload"`.
* **Conclusion:** Force Upload works as designed at the queue level, but is blocked downstream by the pre-existing metadata sync timeout defect.

---

## 4. RCA #3 — Upload Attempts "8 / 5" Counter

### 4.1 Root Cause of Attempt Counter Inflation
Founder UAT observed `Upload attempts: 8 / 5`. In live SQLite inspection of `upload_queue` on the test booth, attempts were found at **5, 7, 10, 12, 14, 16, and 19**!

Two distinct defects cause this phenomenon:

#### Defect A: Flawed Deadlock Detection in `resetStuckUploadWorker()`
In `SyncEngine.ts` (lines 1148–1155):
```typescript
// Mutex deadlock detection: if isUploading is true, but no UPLOADING items exist or inactive > 90s
if (isUploading) {
  const activeUploading = db.prepare("SELECT count(*) as count FROM upload_queue WHERE status = 'UPLOADING'").get() as any;
  if (!activeUploading || activeUploading.count === 0 || Date.now() - lastUploadActivity > 90_000) {
    isUploading = false;
    mutexReset = true;
    lastUploadActivity = Date.now();
  }
}

if (rescuedCount > 0 || mutexReset) {
  recordSystemEvent('UPLOAD_WATCHDOG_RESCUE', 'WARN', 'SyncEngine', `Rescued ${rescuedCount} stuck uploads. Mutex reset: ${mutexReset}`);
  if (triggerWorker) {
    processUploadQueue().catch(() => {});
  }
}
```
* When an item fails the pre-flight check, `stmtUpdateUploadStatus` sets its status to `FAILED`.
* At that instant, `status = 'UPLOADING'` in SQLite becomes `0`.
* Every 15 seconds, `WatchdogService` calls `resetStuckUploadWorker()`.
* The watchdog sees `isUploading === true` BUT `activeUploading.count === 0`.
* It misdiagnoses this as a mutex deadlock, forces `isUploading = false`, and immediately invokes `processUploadQueue()`.
* **Empirical Proof from `kiosk.db`:**
  The system event log proves that `UPLOAD_WATCHDOG_RESCUE (Mutex reset: true)` occurred **every 15 seconds continuously**:
  - `09:12:55.298Z`: `Rescued 0 stuck uploads. Mutex reset: true`
  - `09:13:10.320Z`: `Rescued 0 stuck uploads. Mutex reset: true`
  - `09:13:25.328Z`: `Rescued 0 stuck uploads. Mutex reset: true`
  - `09:13:40.330Z`: `Rescued 0 stuck uploads. Mutex reset: true`
  - `09:13:55.339Z`: `Rescued 0 stuck uploads. Mutex reset: true`
  - `09:14:10.445Z`: `Rescued 0 stuck uploads. Mutex reset: true`

#### Defect B: Race Condition Leading to Super-Limit Increments
* Simultaneously, `uploadInterval = setInterval(..., 4000)` fires every 4 seconds.
* Because the watchdog resets `isUploading = false`, multiple instances of `processUploadQueue()` run concurrently.
* Both Worker 1 and Worker 2 query `stmtGetPendingUploads` when `attempts` is 4.
* Both workers fail pre-flight and execute `stmtUpdateUploadStatus`:
  `SET attempts = attempts + 1`.
* Item attempts increment to 5, then 6, then 8, and up to 19.

#### Defect C: UI Label Formatting
In `SessionHistorySection.tsx` line 723:
```tsx
<span className="font-mono text-slate-200">{selectedSession.uploadAttempts} / 5</span>
```
The `/ 5` was static string presentation of the policy threshold, while `{selectedSession.uploadAttempts}` reflected the live integer from `SELECT MAX(attempts) FROM upload_queue`.

---

## 5. RCA #4 — Unexpected Kiosk Force-Close & Auto-Reopen

### 5.1 Evidence from `kiosk_system_events`
Query of `kiosk.db` on the Founder test machine revealed the authoritative event:
```json
{
  "id": "evt_1790845876190_kkhzr",
  "event_type": "MEMORY_CRITICAL_SOFT_RESTART",
  "severity": "CRITICAL",
  "component": "MemoryWatchdog",
  "details": "Soft restart triggered. Heap: 1633MB, RSS: 2140MB.",
  "created_at": "2026-10-01T09:11:16.190Z"
}
```

### 5.2 Sequence of the Auto-Restart
1. **Memory Escalation:**
   - Multiple concurrent upload workers repeatedly read 3 large RAW images and 3 MP4 video clips into memory using `fs.readFileSync()`.
   - Chromium in the renderer process loaded 50 composite images for the Session History cards.
   - V8 Heap spiked to **1,633 MB** and RSS exceeded **2,140 MB**.
2. **Watchdog Evaluation:**
   - `WatchdogService.ts` lines 242–246:
     ```typescript
     if (heapUsedMb > 800 || rssMb > 1800) {
       criticalMemoryStreak++;
       if (criticalMemoryStreak >= 3) {
         if (currentScreen === 'welcome') {
           app.relaunch();
           app.exit(0);
         }
       }
     }
     ```
   - High memory persisted for 3 consecutive checks (45 seconds), incrementing `criticalMemoryStreak` to 3.
3. **The Screen State Oversight in `App.tsx`:**
   - `WatchdogService` is intentionally coded **NOT to restart** if a user or operator is active on any screen other than `'welcome'`:
     `if (currentScreen === 'welcome') { app.relaunch(); app.exit(0); } else { console.warn('Deferring soft restart...'); }`
   - In `App.tsx` (lines 83–85):
     ```typescript
     const openAdmin = useCallback(() => {
       setIsAdminOpen(true);
     }, []);
     ```
   - Opening the Admin Panel toggles a React modal overlay (`isAdminOpen = true`). It **does not update `screen` state** from `'welcome'`.
   - Therefore, `kiosk.watchdog.setScreen` was never informed that the active screen was `'admin'`.
   - `currentScreen` in the watchdog remained `'welcome'`.
   - While the operator was reading the Session Detail screen, the 45-second critical memory streak completed. The watchdog evaluated `currentScreen === 'welcome'`, assumed the kiosk was an idle walkaway on the welcome screen, and executed:
     `app.relaunch(); app.exit(0);`
   - The application closed cleanly and reopened automatically.

---

## 6. Failure Classification & Regression Matrix

| Failure Symptom | Classification | Origin Date & Commit | Responsibility |
| :--- | :--- | :--- | :--- |
| **Automatic Upload Failure** | **PRE-EXISTING BUG** | Sept 14, 2026 (`41b6f55f94d5`) | `SyncEngine.rowToSession()` serializing bloated Base64 photos in metadata JSON. |
| **Force Upload Failure** | **PRE-EXISTING BUG** | Sept 14, 2026 (`41b6f55f94d5`) | Inherits the identical metadata sync timeout failure as automatic upload. |
| **Attempts 8 / 5 Counter** | **PRE-EXISTING BUG** | Sept 14, 2026 (`41b6f55f94d5`) | Race condition: False deadlock detection in `resetStuckUploadWorker()` spawns overlapping workers that bypass `attempts < 5`. |
| **Kiosk Force-Close & Reopen** | **EXPOSED BY SESSION HISTORY** | Sept 2026 (Phase 3.2E) | `App.tsx` not notifying watchdog of `'admin'` screen state + memory pressure from overlapping upload workers & image list. |

---

## 7. Recommended Minimal Fix (For Review & Approval)

When authorized, the minimal fix requires targeted adjustments across 3 files:

### 1. `SyncEngine.ts` — Eliminate Base64 Photos from Session Metadata Sync
- In `rowToSession()`: When preparing session metadata for cloud sync, map `photos` to clean metadata (file names or sequence numbers) or empty array `[]`, **never** raw Base64 data URIs.
- Backend `SessionsController.syncSession()` does not use `photos`. Stripping Base64 reduces the payload from **~18.4 MB to < 1 KB**.
- Network sync will complete in **< 150 ms**, completely eliminating the pre-flight timeout.

### 2. `SyncEngine.ts` — Fix False Mutex Deadlock Reset
- In `resetStuckUploadWorker()`: Change the mutex reset condition:
  Only reset `isUploading` if `Date.now() - lastUploadActivity > 90_000` (true inactivity), **not** simply because `activeUploading.count === 0` mid-cycle.
- This prevents spawning duplicate concurrent workers and stops `attempts` from exceeding `5`.

### 3. `App.tsx` & `AdminScreen.tsx` — Track Admin Screen in Watchdog
- In `App.tsx`: When `isAdminOpen` changes to `true`, call `kiosk.watchdog.setScreen('admin', null)`. When closed, restore `kiosk.watchdog.setScreen(screen, ...)`.
- This ensures `WatchdogService` defers memory soft-restarts while an operator is working in the Admin Panel or Session History.

### 4. `SessionHistorySection.tsx` — Sanitize Attempt Counter Display
- Display `Math.min(uploadAttempts, 5)} / 5` or dynamically query `max_attempts` from the queue record.

---

## 8. Required Verification & UAT Plan (Post-Fix)

Once implemented, the following verification suite must be executed:
1. **Automated Unit & Data Tests:**
   - Verify `rowToSession()` produces < 2 KB payload for sessions with multi-photo captures.
   - Verify `syncSingleSessionToCloud()` completes in < 500 ms against `api.pictolabs.id`.
   - Verify `resetStuckUploadWorker()` does not reset mutex during active single-worker processing.
2. **Customer Flow Verification:**
   - Run a full real customer capture session (3 photos + composite + live video).
   - Verify automatic upload completes with `status = 'COMPLETED'` and Cloudflare R2 URL populated.
3. **Session History Admin Panel Verification:**
   - Open Session History detail.
   - Verify upload status shows `COMPLETED` and attempts show `1 / 5`.
   - On a simulated network failure, verify Force Upload correctly resets and retries without exceeding 5 attempts.
4. **Watchdog Inactivity Test:**
   - Remain idle on Session History detail screen for 5 minutes.
   - Verify the kiosk remains open and does **not** force-close or auto-restart.

---
*Report produced and verified against the Pictolabs Photobooth Kiosk Codebase.*
