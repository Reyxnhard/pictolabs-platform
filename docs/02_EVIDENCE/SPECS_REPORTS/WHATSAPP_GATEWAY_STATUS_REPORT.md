# WHATSAPP GATEWAY STATUS REPORT
## Deployment Readiness & Integration Audit for Commercial Booth #1

> **Generated:** September 10, 2026  
> **Audience:** Founder / Product Owner  
> **Target:** WhatsApp Gateway & Operational Alerting Infrastructure  
> **Classification Standard:** `COMPLETED` | `PARTIAL` | `MOCK` | `NOT STARTED`  

---

## 1. Status Summary Table

| # | Architecture Component | Status | Current Implementation State |
| :-: | :--- | :---: | :--- |
| **1** | **WhatsApp Provider Selected** | **PARTIAL** | Generic REST client wired for Fonnte / Wablas; production vendor account not yet purchased. |
| **2** | **Architecture Diagram** | **COMPLETED** | Outbound push model: Kiosk/Backend → AlertService → REST Gateway → WhatsApp. |
| **3** | **Authentication Method** | **COMPLETED** | API Token via HTTP Header (`Authorization: <token>`) supported. |
| **4** | **Incoming Message Flow** | **NOT STARTED** | One-way system only. Kiosk does not accept incoming chat or commands. |
| **5** | **Outgoing Message Flow** | **COMPLETED** | 3-tier severity formatter (`INFO`, `WARNING`, `CRITICAL`) with Indonesian copy. |
| **6** | **Delivery Status Tracking** | **MOCK** | Evaluates HTTP 200/500 from provider at dispatch time; no delivery receipt (DLR) webhook. |
| **7** | **Webhook Endpoints** | **PARTIAL** | Test trigger endpoint (`POST /api/alerts/test`) exists; no provider callback webhook. |
| **8** | **Database Tables Used** | **NOT STARTED** | Cooldown and logs run purely in server memory; no PostgreSQL alert audit table. |
| **9** | **Queue System Used** | **NOT STARTED** | Dispatches synchronous HTTP requests; Redis/BullMQ queue not wired for WhatsApp. |
| **10** | **Retry Mechanism** | **MOCK** | Catches errors and falls back to console logs; no exponential retry on provider failure. |
| **11** | **Rate Limiting Strategy** | **COMPLETED** | 15-minute anti-spam deduplication cooldown per booth per alert type. |
| **12** | **Current Implementation Status** | **PARTIAL** | Alert logic, formatting, and mock simulation fully working; vendor account and async queue pending. |

---

## 2. Component Breakdown

### 1. WhatsApp Provider Selected
- **Status:** `PARTIAL`
- **Current State:**
  - The codebase implements an HTTP REST adapter compatible with Indonesian WhatsApp gateway aggregators (specifically **Fonnte** or **Wablas**).
  - Default configuration in `.env.production.example` targets `https://api.fonnte.com/send`.
- **What is Missing:**
  - Active paid vendor subscription.
  - Registered SIM card / WhatsApp Business device connected to the gateway.

---

### 2. Architecture Diagram (High Level)
- **Status:** `COMPLETED`
- **Diagram:**
  ```
  [ Kiosk Event / Heartbeat Failure / Paper Jam ]
                         │
                         ▼
             [ Pictolabs Backend (NestJS) ]
                         │
                         ▼
        [ AlertService: 15-min Cooldown Check ]
                         │
         ┌───────────────┴───────────────┐
         ▼                               ▼
  [ Cooldown Active ]          [ Cooldown Expired / New ]
         │                               │
    (Suppressed)            [ Format Indonesian Message ]
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
              [ Live Env (WA_ENABLED) ]      [ Dev / Unset Credentials ]
                         │                               │
             (POST to Fonnte / Wablas)         (Console Simulation Log)
                         │
                         ▼
            [ WhatsApp Network (Meta) ]
                         │
                         ▼
         [ Field Operator Mobile Device ]
  ```

---

### 3. Authentication Method
- **Status:** `COMPLETED`
- **Current State:**
  - Static Bearer / Token authorization via environment variables:
    ```env
    WA_GATEWAY_URL=https://api.fonnte.com/send
    WA_API_KEY=YOUR_DEVICE_TOKEN
    WA_ADMIN_PHONE=081234567890
    ```
  - Passed via HTTP header on every outgoing alert request.

---

### 4. Incoming Message Flow (2-Way Interaction)
- **Status:** `NOT STARTED`
- **Current State:**
  - The alert system is strictly **one-way (outbound notifications only)**.
  - Operators cannot reply via WhatsApp to acknowledge incidents, reboot kiosks, or query status (e.g. typing `#status` or `#reboot` is not supported).

---

### 5. Outgoing Message Flow
- **Status:** `COMPLETED`
- **Current State:**
  - Dispatches standardized Indonesian plain-text messages with severity indicators:
    - 🚨 `CRITICAL`: Hardware failure (Cutter jam, camera disconnect, kiosk offline).
    - ⚠️ `WARNING`: Low paper (<20 sheets), degraded heartbeat, webcam fallback.
    - ℹ️ `INFO`: Daily booth boot-up, manual reprint audit, system maintenance.
  - Message includes booth name, venue branch, incident summary, timestamp, direct remediation URL, and recommended action.

---

### 6. Delivery Status Tracking (Sent / Delivered / Read)
- **Status:** `MOCK`
- **Current State:**
  - The backend only checks if the external gateway returned an HTTP `200 OK` response during `fetch()`.
  - Does not track carrier delivery receipts (DLR) or read status (`read` / `blue ticks`).
  - When credentials are not set, it returns `{ sent: true, simulated: true }`.

---

### 7. Webhook Endpoints
- **Status:** `PARTIAL`
- **Current State:**
  - **Implemented:** `POST /api/alerts/test` (allows admin or automated tests to trigger a sample alert).
  - **Not Implemented:** `POST /api/alerts/webhook` (no inbound listener to receive status updates or inbound customer replies from the WhatsApp gateway).

---

### 8. Database Tables Used
- **Status:** `NOT STARTED`
- **Current State:**
  - No database tables are used. Cooldown timestamps are stored in-memory:
    ```typescript
    private cooldowns = new Map<string, number>();
    ```
- **Limitation:**
  - If the backend Docker container restarts, cooldown memory resets, which could cause a duplicate alert if an incident occurs immediately after boot.
  - No audit table (`AlertHistory`) exists in PostgreSQL.

---

### 9. Queue System Used (Job Processing)
- **Status:** `NOT STARTED`
- **Current State:**
  - Alerts are dispatched as direct, synchronous HTTP calls (`fetch`) within the request cycle.
  - Redis is running in the Docker stack for caching, but BullMQ / Redis job queue is not wired to the WhatsApp alert pipeline.

---

### 10. Retry Mechanism
- **Status:** `MOCK`
- **Current State:**
  - If the external gateway request times out or throws an error, the error is caught, logged in NestJS logs, and swallowed to avoid crashing the kiosk or caller.
  - No automatic exponential retry or dead-letter queue (DLQ) exists. If the gateway is down, that specific alert is lost.

---

### 11. Rate Limiting Strategy
- **Status:** `COMPLETED`
- **Current State:**
  - Cooldown period: **15 minutes** per alert type per booth.
  - Example: If Booth #1 sends `ERR_PRINTER_PAPER_JAM`, repeated jams within 15 minutes are throttled to prevent spamming the operator's phone.
  - Cooldown can be bypassed on demand using the internal flag `skipCooldown: true`.

---

### 12. Current Overall Implementation Status
- **Status:** `PARTIAL`
- **Founder Assessment:**
  - **Software layer:** Ready. The code formatting, severity levels, cooldown logic, and API hooks are in place and verified in automated tests (`npm run test:sprint5c`).
  - **Operational layer:** Pending. Requires selecting a commercial vendor (e.g. Fonnte: ~Rp 75.000/month or Wablas), connecting a phone number, and filling in the `.env` credentials on the production server.
