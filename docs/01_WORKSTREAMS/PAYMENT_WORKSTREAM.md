# PAYMENT WORKSTREAM CONTEXT

## 1. Purpose
The Payment Workstream handles customer transactions for photobooth sessions. It generates Midtrans Dynamic QRIS codes, verifies SHA-512 webhooks for instant auto-advance, prevents double-charging and QR code blinking, and provides an offline cash/voucher bypass mode for booth operation during network outages.

## 2. Current Status

| Feature / Component | Status | Notes |
|:---|:---:|:---|
| **Midtrans Dynamic QRIS Core API** | `AUTOMATED_VERIFIED` | Core API `/charge` integration complete with SHA-512 checks. |
| **Midtrans Dynamic QRIS Sandbox** | `BLOCKED (EXTERNAL 402)` | Real Sandbox charge returns 402 ("Payment channel is not activated"). Awaiting Midtrans Support channel routing. |
| **Sub-Second Webhook Auto-Advance** | `AUTOMATED_VERIFIED` | WebSocket triggers instant screen advance upon payment notification. |
| **Payment Loop & Blink Fix** | `AUTOMATED_VERIFIED` | Session reference pinning prevents QR regeneration loops. |
| **Offline Payment Bypass Mode** | `AUTOMATED_VERIFIED` | 6-digit Admin PIN unlocks free session during network outage. |
| **Sandbox Simulation Verification** | `AUTOMATED_VERIFIED` | Verified via `verify_payment_transaction_lifecycle.mjs` and `payments.e2e.ts`. |
| **Production Merchant Account Onboarding**| `NOT_STARTED` | **OPEN** — Production credentials not provisioned. |
| **Live Banking App E2E Verification** | `NOT_STARTED / UNVERIFIED` | Dynamic QRIS live and settlement remain UNVERIFIED; blocked by Midtrans 402. |

## 3. Completed / Verified
- **Implemented:** `payments.service.ts` in backend, [`PaymentScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/PaymentScreen.tsx) in kiosk, WebSocket payment notifications, and Offline Payment Bypass mode (Commit `71d361d` and `157975b`).
- **Automated Verified:** `verify_payment_transaction_lifecycle.mjs` verifies order ID creation, mock webhook dispatch, and state machine transitions.
- **Founder Physical UAT:** Verified in Sandbox simulation mode on physical booth; real banking app scan test confirmed expected rejection of simulated EMVCo string.
- **Production Verified:** NOT YET VERIFIED on production banking networks.

## 4. Current Architecture
1. **Dynamic QRIS Generation:** When customer enters [`PaymentScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/PaymentScreen.tsx), the kiosk requests a QRIS barcode from backend `POST /api/payments/qris`.
2. **Key Guard & Live Sandbox Call:** `payments.service.ts` validates server key with `isConfiguredKey()`. Unconfigured/placeholder keys throw HTTP 503. Configured keys make real HTTPS requests to `api.sandbox.midtrans.com/v2/charge` (502 Bad Gateway on rejection). Fake fallback QRIS generation has been completely eliminated.
3. **Webhook & Auto-Advance:** Midtrans POSTs transaction status to backend; backend validates SHA-512 signature (`order_id + status_code + gross_amount + ServerKey`) and broadcasts payment success over WebSocket to Kiosk, automatically transitioning to [`CaptureScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/CaptureScreen.tsx).
4. **Offline Mode:** If internet is offline, operator enters Admin PIN to activate Cash/Voucher bypass, marking transaction `OFFLINE_BYPASS` in SQLite recovery ledger.

## 5. Current Invariants
- **Unique Order ID:** Every payment attempt must generate a distinct, cryptographically random `orderId` tied to `sessionId`; order IDs must never be recycled.
- **Signature Security:** Backend webhook endpoint MUST reject any callback failing the SHA-512 signature verification.
- **No Production False Claims:** System MUST NOT be marked production-ready until live merchant credentials are authenticated and a real banking app transacts successfully.
- **Audit Logging:** Every offline payment bypass event must log an immutable audit record in local SQLite.

## 6. Known Open Issues
- **Decoupled PR-01 Exception Blocker:** Dynamic QRIS Live Sandbox Settlement is BLOCKED by Midtrans error `402: Payment channel is not activated`. Real API credentials are configured in local `.env`, but Midtrans Merchant switch has not enabled Core API QRIS for this Merchant ID. Formal inquiry submitted to Midtrans Support. This blocker is formally decoupled from PR-01 (Booth Configuration Foundation) and tracked as an open Pilot-Wide Release Gate.
- **Commercial Pilot Launch Blocker:** Production Midtrans merchant onboarding is not completed; live production API keys are not loaded into environment.
- **Verification Integrity:** Live Dynamic QRIS generation and settlement remain **UNVERIFIED** (NOT completed).

## 7. Next Task
Submit business documentation to Midtrans for live merchant account onboarding, or formally approve launching Booth #1 initially in **Offline Cash / Voucher Bypass Mode**.

## 8. Evidence
1. [`docs/PAYMENT_ENVIRONMENT_AUDIT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/AUDITS/PAYMENT_ENVIRONMENT_AUDIT.md) — Definitive runtime audit of active API keys and banking app behavior.
2. [`docs/PAYMENT_BLINK_RCA.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/RCA/PAYMENT_BLINK_RCA.md) — 435-line forensic RCA of transaction loop and blink defect.
3. [`docs/PAYMENT_TRANSACTION_LOOP_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/PAYMENT_TRANSACTION_LOOP_FIX_REPORT.md) — State machine fix report.
4. [`docs/OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/docs/02_EVIDENCE/FIX_REPORTS/OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md) — Offline bypass implementation and PIN gating.
5. Commit `71d361d` (*"qris done (tapi masih sandbox)"*).

## 9. Related Workstreams
- **Dashboard:** Pricing control configured in dashboard syncs to kiosk payment screen.
- **Security:** Offline bypass mode is authenticated by the 6-digit Admin PIN.
- **Session History:** Completed transactions link directly to customer session records.

## 10. Status Confidence
**HIGH.** Full source code verified; sandbox behavior mathematically confirmed; production merchant onboarding requirement accurately documented.
