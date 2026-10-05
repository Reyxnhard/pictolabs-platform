# PICTOLABS PHOTOBOOTH — HEARTBEAT STATUS & TIMEOUT RULES

**Document Reference**: `HEARTBEAT_STATUS_RULES.md`  
**Classification**: Engineering Telemetry & Reliability Specification  
**Status**: Authoritative Reference (Codebase Verified)  
**Mode**: Audit Only (No Implementation)

---

## 1. Executive Summary & Exact Numeric Thresholds

| Status | Exact Condition (Age of Last Heartbeat) | Exact Numeric Threshold | Meaning / Operational State |
| :--- | :--- | :--- | :--- |
| **ONLINE** | `ageSeconds < 60` | **`< 60 seconds`** (`onlineUnderSeconds: 60`) | Normal operation. At least 1 heartbeat received within the last minute. |
| **DEGRADED** | `60 <= ageSeconds < 300` | **`60s – 299s`** (`degradedUnderSeconds: 300`) | Heartbeat delayed. Kiosk missed 2 to 9 consecutive heartbeat cycles (packet loss / network jitter). |
| **OFFLINE** | `ageSeconds >= 300` OR `lastSeen == null` | **`>= 300 seconds`** (`offlineOverSeconds: 300`) | Disconnected. Kiosk missed 10+ consecutive cycles (power loss, dead process, internet outage). |
| **MAINTENANCE** | `manualStatus === 'MAINTENANCE'` | **N/A (Overrides all timers)** | Administrative override set via Dashboard. Takes precedence over any active heartbeat. |

### Client-Side Timers & Network Timeouts:
- **HTTP Heartbeat Cadence**: **`30,000 ms` (30 seconds)** (`SyncEngine.ts:1142`)
- **HTTP Heartbeat Request Timeout**: **`10,000 ms` (10 seconds)** (`SyncEngine.ts:1068`, `AbortSignal.timeout(10000)`)
- **WebSocket Health Telemetry Ping**: **`10,000 ms` (10 seconds)** (`SyncEngine.ts:1016`)
- **Camera Keep-Alive Loop**: **`10,000 ms` (10 seconds)** (`CameraService.ts:142`)

---

## 2. Search Term Reconciliation

During the code audit across `apps/backend`, `apps/kiosk`, and `apps/dashboard`:

| Search Query Term | Representation in Active Codebase | File Location |
| :--- | :--- | :--- |
| **`effectiveStatus`** | Property name returned by `computeEffectiveStatus()` and API endpoints (`'ONLINE' \| 'DEGRADED' \| 'OFFLINE' \| 'MAINTENANCE'`) | `apps/backend/src/booths/booths.service.ts:27` |
| **`degradedThreshold`** | Named **`degradedUnderSeconds: 300`** in API and types | `apps/backend/src/booths/booths.service.ts:208`<br>`apps/dashboard/src/types/booth.ts:83` |
| **`offlineThreshold`** | Named **`offlineOverSeconds: 300`** in API and types | `apps/backend/src/booths/booths.service.ts:209`<br>`apps/dashboard/src/types/booth.ts:84` |
| **`heartbeat timeout`** | Client HTTP timeout is **`10,000 ms`** (`AbortSignal.timeout(10000)`). Status transition timeout to OFFLINE is **`300 seconds`**. | `apps/kiosk/electron/services/SyncEngine.ts:1068`<br>`apps/backend/src/booths/booths.service.ts:68` |

---

## 3. Status Calculation Rules & Algorithm

The single source of truth for booth status is dynamically computed on query in **`apps/backend/src/booths/booths.service.ts`** via `computeEffectiveStatus()`. The database column `Booth.status` stores only the administrative state (`NORMAL` vs `MAINTENANCE`), never dynamic connectivity.

### Mathematical Formulation:

Given:
$$\Delta t = \lfloor \frac{\text{now}() - \text{lastSeen}}{1000} \rfloor \quad (\text{in seconds})$$

### Execution Precedence (Top-to-Bottom):

```
┌────────────────────────────────────────────────────────┐
│  Is manualStatus === 'MAINTENANCE'?                    │
└──────────────────────────┬─────────────────────────────┘
                           │
             YES ──────────┴────────── NO
              │                        │
              ▼                        ▼
     ┌─────────────────┐     ┌────────────────────────────────────┐
     │  MAINTENANCE    │     │  Is lastSeen null or missing?      │
     │  (Override)     │     └─────────────────┬──────────────────┘
     └─────────────────┘                       │
                                 YES ──────────┴────────── NO
                                  │                        │
                                  ▼                        ▼
                         ┌─────────────────┐     ┌───────────────────────────────────┐
                         │    OFFLINE      │     │  Is ageSeconds < 60?              │
                         └─────────────────┘     └─────────────────┬─────────────────┘
                                                           │
                                             YES ──────────┴────────── NO
                                              │                        │
                                              ▼                        ▼
                                     ┌─────────────────┐     ┌───────────────────────────────────┐
                                     │     ONLINE      │     │  Is ageSeconds < 300?             │
                                     └─────────────────┘     └─────────────────┬─────────────────┘
                                                                               │
                                                                 YES ──────────┴────────── NO
                                                                  │                        │
                                                                  ▼                        ▼
                                                         ┌─────────────────┐     ┌───────────────────┐
                                                         │    DEGRADED     │     │     OFFLINE       │
                                                         └─────────────────┘     └───────────────────┘
```

### Code Implementation (`apps/backend/src/booths/booths.service.ts:23-73`):

```typescript
computeEffectiveStatus(
  lastSeen?: Date | null,
  manualStatus?: string
): {
  effectiveStatus: ComputedStatus;
  secondsSinceLastHeartbeat: number | null;
  isMaintenance: boolean;
} {
  const isMaintenance = manualStatus === 'MAINTENANCE';
  const ageSeconds = lastSeen
    ? Math.max(0, Math.floor((Date.now() - new Date(lastSeen).getTime()) / 1000))
    : null;

  // Rule 1: Administrative Override (Highest Priority)
  if (isMaintenance) {
    return {
      effectiveStatus: 'MAINTENANCE',
      secondsSinceLastHeartbeat: ageSeconds,
      isMaintenance: true,
    };
  }

  // Rule 2: Unseen / Null Heartbeat
  if (!lastSeen || ageSeconds === null) {
    return {
      effectiveStatus: 'OFFLINE',
      secondsSinceLastHeartbeat: null,
      isMaintenance: false,
    };
  }

  // Rule 3: ONLINE Threshold (< 60s)
  if (ageSeconds < 60) {
    return {
      effectiveStatus: 'ONLINE',
      secondsSinceLastHeartbeat: ageSeconds,
      isMaintenance: false,
    };
  }

  // Rule 4: DEGRADED Threshold (60s <= age < 300s)
  if (ageSeconds < 300) {
    return {
      effectiveStatus: 'DEGRADED',
      secondsSinceLastHeartbeat: ageSeconds,
      isMaintenance: false,
    };
  }

  // Rule 5: OFFLINE Threshold (>= 300s)
  return {
    effectiveStatus: 'OFFLINE',
    secondsSinceLastHeartbeat: ageSeconds,
    isMaintenance: false,
  };
}
```

---

## 4. Timeout Profiles in Detail

### 1. ONLINE Timeout: `< 60 seconds`
- **Value**: `ageSeconds < 60` (`onlineUnderSeconds: 60`)
- **Heartbeat Transmission Frequency**: Every 30 seconds (`SyncEngine.ts:1142`).
- **Tolerance**: Allows for **1 lost heartbeat** or network delay up to 29 seconds without degrading status.
- **Trigger**: Once a new heartbeat POST reaches `/api/booths/:id/heartbeat`, `lastSeen` is set to `now()`, resetting `ageSeconds` to 0.

### 2. DEGRADED Timeout: `60 seconds to 299 seconds`
- **Value**: `60 <= ageSeconds < 300` (`degradedUnderSeconds: 300` / 5 minutes)
- **Tolerated Missed Cycles**: 2 to 9 missed heartbeats (at 30s cadence).
- **Dashboard Representation**: Amber badge (`DEGRADED`), warning severity in `BoothHealthCard`.
- **Operational Meaning**: The kiosk application or network is lagging, experiencing severe packet loss, or undergoing high CPU contention, but has been heard from in the past 5 minutes.

### 3. OFFLINE Timeout: `>= 300 seconds` (5 Minutes)
- **Value**: `ageSeconds >= 300` (`offlineOverSeconds: 300`)
- **Tolerated Missed Cycles**: 10 or more consecutive missed heartbeats.
- **Dashboard Representation**: Red badge (`OFFLINE`), critical severity in `BoothHealthCard`.
- **Operational Meaning**: Kiosk is considered dead, disconnected from Wi-Fi, powered off, or crashed.

---

## 5. API Response Contracts

### A. Individual Diagnostic Endpoint (`GET /api/booths/:id/status`)
Defined in `apps/backend/src/booths/booths.service.ts:187-221`:

```json
{
  "boothId": "8f03be00-e793-490a-a92c-e35c879f8241",
  "name": "PICTOLABS-DEV-01",
  "status": "ONLINE",
  "isMaintenance": false,
  "lastSeen": "2026-09-22T03:15:22.411Z",
  "secondsSinceLastHeartbeat": 14,
  "thresholds": {
    "onlineUnderSeconds": 60,
    "degradedUnderSeconds": 300,
    "offlineOverSeconds": 300
  },
  "runtime": {
    "appVersion": "1.2.5",
    "gitCommit": "1457ae6",
    "osVersion": "Windows_NT 10.0.26100 (x64)",
    "electronVersion": "28.2.0",
    "releaseChannel": "stable",
    "machineName": "DESKTOP-PICTO",
    "localIp": "192.168.1.105"
  }
}
```

### B. Fleet List Endpoint (`GET /api/booths`)
Defined in `apps/backend/src/booths/booths.service.ts:226-258`:

```json
[
  {
    "id": "8f03be00-e793-490a-a92c-e35c879f8241",
    "name": "PICTOLABS-DEV-01",
    "status": "ONLINE",
    "rawStatus": "NORMAL",
    "isMaintenance": false,
    "lastSeen": "2026-09-22T03:15:22.411Z",
    "secondsSinceLastHeartbeat": 14,
    "branchName": "Pakuwon Mall"
  }
]
```

### C. Heartbeat Ingest Response (`POST /api/booths/:id/heartbeat`)
Defined in `apps/backend/src/booths/booths.service.ts:136-151`:

```json
{
  "success": true,
  "boothId": "8f03be00-e793-490a-a92c-e35c879f8241",
  "status": "ONLINE",
  "isMaintenance": false,
  "lastSeen": "2026-09-22T03:15:22.411Z",
  "secondsSinceLastHeartbeat": 0,
  "acknowledged": true
}
```

---

## 6. Frontend Dashboard Display

In `apps/dashboard/src/components/booths/BoothDetailDrawer.tsx` (lines 249–253):

```tsx
<div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1 font-mono">
  <span>Online: &lt;60s</span>
  <span>Degraded: &lt;300s</span>
  <span>Offline: &ge;300s</span>
</div>
```

---

## 7. Audit Conclusion

All status rules and timeouts in the Pictolabs platform are deterministic and centralized:
1. **Status Calculation Rules**: Evaluated dynamically based on heartbeat elapsed age ($\Delta t$).
2. **ONLINE timeout**: Exact value is **`< 60 seconds`** (`onlineUnderSeconds: 60`).
3. **DEGRADED timeout**: Exact value is **`60s – 299s`** (`degradedUnderSeconds: 300`, or `< 5 minutes`).
4. **OFFLINE timeout**: Exact value is **`>= 300 seconds`** (`offlineOverSeconds: 300`, or `>= 5 minutes`).
5. **Heartbeat Network Timeout**: Exact value is **`10,000 ms`** (10s abort limit on client HTTP requests).
