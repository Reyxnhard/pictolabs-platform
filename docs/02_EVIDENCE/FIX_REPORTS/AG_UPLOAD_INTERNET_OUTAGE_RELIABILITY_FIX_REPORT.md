# UPLOAD / INTERNET OUTAGE RELIABILITY FIX REPORT

**Document ID:** `AG-FIX-UPLOAD-OUTAGE-001`  
**Date:** 2026-10-07  
**Subsystem:** Kiosk SyncEngine (`apps/kiosk`) & Cloud Storage Controller (`apps/backend`)  
**Audit Reference:** [`docs/02_EVIDENCE/AUDITS/AG_UPLOAD_INTERNET_OUTAGE_RELIABILITY_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/AG_UPLOAD_INTERNET_OUTAGE_RELIABILITY_AUDIT.md)  
**Status:** CLOSED — FOUNDER PHYSICAL UAT PASS (S1–S6 100% PASS)  
**Final Gate Status:** CLOSED (Upload Internet Outage Reliability)  

---

## 1. Root Cause Analysis

Following the Upload / Internet Outage Reliability Audit, four distinct failure mechanisms were identified:

1. **Gap 1 (Retry Exhaustion Stranding):**
   - In [`SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts), the pending upload statement was strictly bounded to `attempts < 5`.
   - During network outages lasting beyond ~62 seconds (exponential backoff 2s + 4s + 8s + 16s + 32s), `attempts` reached 5.
   - Once `attempts >= 5`, items were permanently ignored by the polling query. When internet connectivity returned, pending customer media uploads remained stranded unless the operator manually clicked "Force Upload" in the Session History Center.

2. **Gap 2 (Background GIF Enqueue Mismatch):**
   - Following Printer RCA-7, looping GIF generation was moved to an asynchronous background task in [`RenderScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/RenderScreen.tsx), calling `kiosk.session.update(sessionId, { gifPath })`.
   - In [`SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts), `updateSession()` only enqueued `update.compositePath` into `upload_queue`. It completely omitted `update.gifPath`.
   - Furthermore, positional argument misalignment in `stmtUpdateSession` caused parameter shifts, preventing `gif_path` and `gif_url` from persisting in SQLite.

3. **Gap 3 (Non-Idempotent Photo Ledger Creation):**
   - In [`storage.controller.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.controller.ts), `/api/storage/confirm-upload` executed unconditional `this.prisma.photo.create()`.
   - When a network timeout occurred after Cloudflare R2 PUT but before confirmation HTTP response was received, or when an operator triggered manual Force Upload, multiple duplicate rows were inserted into the PostgreSQL `photos` table for the same physical asset.

4. **Gap 4 (Missing Network-Recovery Trigger):**
   - Neither WebSocket reconnect events nor periodic HTTP heartbeat successes triggered re-evaluation of failed uploads.
   - The queue was purely timer-polled with a hard attempt ceiling, leaving no automated recovery path upon link restoration.

---

## 2. Changes Implemented

| File | Change Description | Impact |
| :--- | :--- | :--- |
| [`SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts) | Added `gif_path` and `gif_url` column migrations in `initDatabase()`. Refactored `stmtUpdateSession` to robust named parameters (`@id`, `@frameId`, etc.). Added GIF enqueueing (`'video'`) and upload worker trigger in `updateSession()`. Added GIF re-enqueueing in `forceUploadSession()`. Updated `processUploadQueue()` to record `gif_url` on upload completion. | Closes Gap 2 (P1) |
| [`SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts) | Implemented `isPermanentUploadError()` classifier and `rearmRetryableUploads()` self-healing routine. | Closes Gap 1 (P1) & Gap 4 (P2) |
| [`SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts) | Added bounded store-and-forward periodic check in `processUploadQueue()` for items backed off > 60s. Hooked `rearmRetryableUploads(true)` to `socket.on('connect')` and `sendHttpHeartbeat()` (`res.ok`). | Closes Gap 1 (P1) & Gap 4 (P2) |
| [`storage.controller.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.controller.ts) | Added `findFirst` deduplication query against `(sessionId, storageKey)` in both `confirmUpload` and `uploadFile`. Returns existing `photoId` with `alreadyConfirmed: true` without duplicating rows. | Closes Gap 3 (P2) |
| [`upload-outage-recovery.spec.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/upload-outage-recovery.spec.ts) | Comprehensive automated verification test suite covering Scenarios A through F. | Verification Evidence |

---

## 3. Retry Strategy

The new retry engine implements a **two-tier store-and-forward architecture**:

1. **Fast Tier (Exponential Backoff, Attempts 1–4):**
   - Backoff interval: $2^{\text{attempts}} \times 1000\text{ ms}$ (2s, 4s, 8s, 16s, 32s max).
   - Designed for transient blips and momentary latency spikes.

2. **Quiescent Bounded Tier (Attempt $\ge$ 5):**
   - Once an item reaches 5 failed attempts during an extended outage, it enters quiescent state and is skipped by the fast 4-second polling loop.
   - **No Storm:** During a 10–30 minute outage, the kiosk does not flood the local CPU or network stack with rapid retry loops.
   - **Bounded Fallback:** Every 60 seconds, any retryable item that has waited past the 60-second window is eligible for store-and-forward re-arming.

3. **Strict Error Isolation (`isPermanentUploadError`):**
   - **Permanent Errors (NEVER Re-armed):**
     - Local file missing / `ENOENT`
     - Terminal `DEAD_LETTER` state
     - HTTP 400 Bad Request / Payload Too Large
     - HTTP 401 Unauthorized / `INVALID_DEVICE` (decommissioned/unlinked)
     - HTTP 403 Forbidden
     - HTTP 404 Not Found / `SESSION_NOT_FOUND`
   - **Retryable Errors (Eligible for Automatic Re-arm):**
     - Network disconnection (`fetch failed`, `ECONNREFUSED`, `ENOTFOUND`, `UND_ERR_CONNECT_TIMEOUT`, `ETIMEDOUT`)
     - Pre-flight sync network errors
     - Cloudflare R2 gateway timeouts / HTTP 500, 502, 503, 504
     - Confirmation network timeouts

---

## 4. GIF Upload Fix

- In [`SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts), when `updateSession(sessionId, { gifPath })` is called by [`RenderScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/RenderScreen.tsx):
  - `gif_path` is persisted in SQLite via named parameters.
  - If `update.gifPath` exists on disk, `enqueueUpload(id, update.gifPath, 'video')` is executed immediately.
  - The SQLite table `upload_queue` enforces primary key `upload_${sessionId}_video_${filename}` with `INSERT OR IGNORE`. Repeated calls to `updateSession` with the same GIF are strictly idempotent (0 duplicate rows).
  - Background `processUploadQueue().catch(() => {})` is dispatched asynchronously, preserving RCA-7 non-blocking customer navigation.
  - When the GIF finishes uploading, `processUploadQueue()` detects `.gif` extension and automatically populates `gif_url` on the session row in SQLite.

---

## 5. Photo Idempotency Fix

- In [`storage.controller.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.controller.ts):
  - Before inserting a row into `prisma.photo`, a pre-flight deduplication query runs:
    ```typescript
    const targetStorageKey = body.key || body.fileName;
    const existingPhoto = await this.prisma.photo.findFirst({
      where: {
        sessionId: body.sessionId,
        storageKey: targetStorageKey,
      },
    });
    ```
  - If `existingPhoto` exists:
    - No new `Photo` row is inserted.
    - If `finalUrl` has changed, the existing record is updated.
    - Controller returns `{ success: true, confirmed: true, alreadyConfirmed: true, photoId: existingPhoto.id }`.
  - If `existingPhoto` is null:
    - New `Photo` row is created.
  - Identical idempotency check was added to `uploadFile` (streaming fallback).
  - Result: Retrying confirmation after HTTP timeout, or clicking manual Force Upload, produces **zero duplicate rows** in PostgreSQL.

---

## 6. Network Recovery Mechanism

Two primary triggers automatically re-arm retryable uploads as soon as internet connectivity returns:

1. **WebSocket Reconnect Trigger:**
   ```typescript
   socket.on('connect', () => {
     console.log('✓ [SyncEngine] Real-time WebSocket connected to cloud backend:', targetUrl);
     rearmRetryableUploads(true);
   });
   ```
   When the booth regains internet, Socket.io reconnects within ~2 seconds and triggers `rearmRetryableUploads(true)`.

2. **HTTP Heartbeat Success Trigger:**
   ```typescript
   if (res.ok) {
     const data = (await res.json()) as any;
     rearmRetryableUploads(true);
   }
   ```
   The authoritative 30-second HTTP heartbeat detects network recovery on its very first successful response.

3. **Store-and-Forward Bounded Sweep:**
   If socket and heartbeat are delayed, `processUploadQueue()` inspects items with `attempts >= 5` whose backoff exceeds 60 seconds and re-arms them.

---

## 7. Automated Test Results

A dedicated automated test suite was constructed: [`upload-outage-recovery.spec.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/upload-outage-recovery.spec.ts).

### Test Execution Summary
```
═══════════════════════════════════════════════════════════════════════
  PICTOLABS: UPLOAD & INTERNET OUTAGE RELIABILITY VERIFICATION SUITE  
═══════════════════════════════════════════════════════════════════════

[SCENARIO A: NETWORK OUTAGE > 5 RETRIES & AUTOMATIC RECOVERY]
  ✓ [PASS] Item A enqueued in upload_queue
  ✓ [PASS] Item A initial status is PENDING
  ✓ [PASS] Item A status is FAILED after outage
  ✓ [PASS] Item A has reached 5 attempts
  ✓ [PASS] Exhausted item is quiescent (ignored by fast loop)
  ✓ [PASS] rearmRetryableUploads re-armed exhausted item
  ✓ [PASS] Item A status returned to PENDING
  ✓ [PASS] Item A attempts reset to 0
  ✓ [PASS] Session A marked uploaded=1 after network recovery

[SCENARIO B: NETWORK OUTAGE 10+ MINUTES (NO STORM, NO ABANDONMENT)]
  ✓ [PASS] Item B persisted in SQLite store-and-forward queue
  ✓ [PASS] Item B eligible for bounded store-and-forward recovery
  ✓ [PASS] Item B successfully re-armed without operator intervention
  ✓ [PASS] Item B is PENDING and ready for transmission

[SCENARIO C: BACKGROUND GIF ENQUEUE & IDEMPOTENCY]
  ✓ [PASS] GIF not in queue before background generation finishes
  ✓ [PASS] Session updated with gifPath
  ✓ [PASS] GIF entered upload_queue exactly once
  ✓ [PASS] GIF registered with file_type = video
  ✓ [PASS] Second updateSession succeeded
  ✓ [PASS] Duplicate updateSession did NOT create duplicate upload_queue row
  ✓ [PASS] Session gif_url successfully updated on upload completion

[SCENARIO D: CONFIRMATION RETRY IDEMPOTENCY]
  ✓ [PASS] First confirmation returns success
  ✓ [PASS] First confirmation returns confirmed=true
  ✓ [PASS] First confirmation reports alreadyConfirmed=false
  ✓ [PASS] Exactly one Photo row exists after first confirmation
  ✓ [PASS] Second confirmation retry returns success
  ✓ [PASS] Second confirmation retry returns confirmed=true
  ✓ [PASS] Second confirmation reports alreadyConfirmed=true
  ✓ [PASS] Reused identical Photo ID on retry
  ✓ [PASS] Exactly one Photo row exists (zero duplicate rows)

[SCENARIO E: FORCE UPLOAD AFTER COMPLETED UPLOAD]
  ✓ [PASS] Force Upload executes successfully
  ✓ [PASS] Force Upload confirmation succeeds
  ✓ [PASS] Force Upload recognized existing asset
  ✓ [PASS] Zero duplicate Photo records after Force Upload

[SCENARIO F: PERMANENT FAILURE ISOLATION]
  ✓ [PASS] Classifies missing local file as permanent
  ✓ [PASS] Classifies ENOENT as permanent
  ✓ [PASS] Classifies INVALID_DEVICE as permanent
  ✓ [PASS] Classifies HTTP 400 as permanent
  ✓ [PASS] Classifies HTTP 403 as permanent
  ✓ [PASS] Classifies HTTP 404 as permanent
  ✓ [PASS] Classifies DEAD_LETTER as permanent
  ✓ [PASS] fetch failed is retryable
  ✓ [PASS] ECONNREFUSED is retryable
  ✓ [PASS] ETIMEDOUT is retryable
  ✓ [PASS] HTTP 502 is retryable
  ✓ [PASS] Confirm network error is retryable
  ✓ [PASS] Permanent missing file remained FAILED
  ✓ [PASS] Permanent missing file attempts were NOT reset to 0

═══════════════════════════════════════════════════════════════════════
   TEST RESULTS: 47 PASSED, 0 FAILED                     
═══════════════════════════════════════════════════════════════════════
```

---

## 8. Regression Results

All relevant existing regression suites were executed with zero failures:

1. **Storage Retention Suite ([`storage-retention.spec.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/storage-retention.spec.ts)):**
   - 6/6 tests passed (Three-Key Lock, Orphan Janitor, Full Cleanup, Rehydration, WAL Compaction, Emergency Waterfall).
2. **Burn-in Endurance Suite ([`burn-in.spec.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/burn-in.spec.ts)):**
   - 34/34 assertions passed (Scenarios A through J, including 30-minute offline store-and-forward and upload watchdog mutex rescue).
3. **Crash Recovery Suite ([`crash-recovery-e2e.spec.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/crash-recovery-e2e.spec.ts)):**
   - 33/33 assertions passed (Scenarios A through F).
4. **Printer RCA-7 Simplification Suite ([`rca7-simplification.spec.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/rca7-simplification.spec.ts)):**
   - All 6 tests & 10 invariants passed. Zero printer regression.
5. **TypeScript Compilation:**
   - `apps/backend`: `npx tsc --noEmit` exited 0 (clean).
   - `apps/kiosk` (electron): `npx tsc -p tsconfig.electron.json --noEmit` exited 0 (clean).
   - `apps/kiosk` (renderer): `npx tsc --noEmit` exited 0 (clean).

---

## 9. Remaining Risks

| Risk | Likelihood | Impact | Mitigation |
| :--- | :--- | :--- | :--- |
| Cloudflare R2 bucket credentials revoked during flight | Low | Medium | R2 error returns 401/403 which correctly classifies as permanent or falls back to standard HTTP stream upload. |
| Hard disk runs out of space while queue is accumulating offline captures | Very Low | High | Storage retention engine's Emergency Waterfall purge protects SSD; print jobs and composite files have three-key lock protection. |
| Extended outage (>24 hours) | Low | Low | All items persist indefinitely in SQLite WAL database until link restoration or manual operator action. |

---

## 10. Founder Physical UAT Matrix & Results (Booth #1)

Executed on live physical Photobooth Booth #1 hardware by Founder:

| Scenario | Action | Expected Behavior | Verification Point | Physical Result |
| :---: | :--- | :--- | :--- | :---: |
| **S1** | With WiFi connected, run standard session (capture $\to$ print). | Photos print, upload finishes, QR scan downloads composite + GIF. | QR scan displays both composite and looping GIF. | **PASS** |
| **S2** | Disconnect Ethernet/WiFi adapter on Booth #1. | Booth stays functional for customers. Print continues normally. | Session completes locally. Photos saved on SSD. | **PASS** |
| **S3** | Leave internet OFF for 10 minutes. Complete 1 additional session. | Both sessions queued in local SQLite `upload_queue`. No crash or UI stutter. | Admin History shows `UPLOAD_PENDING` / failed retries without freezing. | **PASS** |
| **S4** | Reconnect Ethernet/WiFi adapter on Booth #1. | Within 5–30 seconds, uploads resume automatically without touching "Force Upload". | Telemetry status turns green; uploads transition to `COMPLETED`. | **PASS** |
| **S5** | Scan QR code on smartphone. | Downloads load successfully from Cloudflare R2. | Mobile browser opens customer download portal. | **PASS** |
| **S6** | Navigate to Admin History Center $\to$ click "Force Upload" on the completed session. | Operation succeeds without creating duplicate Photo records in backend database. | PostgreSQL `photos` table count remains exactly 1 per photo asset. | **PASS** |

**Founder Physical UAT Verdict:** **6/6 SCENARIOS PASS (100% SUCCESS)**

---

## 11. Git State

- **Branch:** `main`
- **Base Commit:** `1d732b8`
- **Working Tree:**
  - Modified:
    - [`pictolabs-rebuild/apps/backend/src/storage/storage.controller.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/backend/src/storage/storage.controller.ts)
    - [`pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/SyncEngine.ts)
  - Added Test:
    - [`pictolabs-rebuild/apps/kiosk/electron/services/upload-outage-recovery.spec.ts`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/electron/services/upload-outage-recovery.spec.ts)
- **Status:** Uncommitted (ready for Final Release Pre-Commit synchronization).

---

## 12. Final Technical Verdict & Release Gate Status

- **Automated Verification:** **47/47 PASSED** (Scenarios A through F)
- **Founder Physical UAT:** **6/6 PASSED** (Scenarios S1 through S6 on Booth #1)
- **Subsystem Gate Status:** **UPLOAD OUTAGE RELIABILITY = CLOSED**  
All four confirmed gaps (P1 retry exhaustion, P1 background GIF enqueue, P2 confirmation idempotency, P2 network recovery trigger) are fully resolved with zero architectural drift, zero regression to Printer RCA-7, and verified by Founder on live hardware.
