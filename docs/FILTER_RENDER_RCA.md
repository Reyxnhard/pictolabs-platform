# Root Cause Analysis (RCA): Filter-to-Render Pipeline Failure

**Document ID:** `FILTER_RENDER_RCA.md`  
**Date:** September 23, 2026 (03:00 WIB)  
**Status:** AUDIT COMPLETE — ROOT CAUSE ISOLATED  
**Component:** Kiosk UI (`FilterScreen.tsx`, `QrScreen.tsx`) → Electron IPC (`RenderEngine.ts`) → Spooler (`PrintQueueService.ts`) → Cloud Sync (`SyncEngine.ts`)  
**Target Device:** Pictolabs Photobooth Kiosk (DNP DS-RX1 / Canon EOS DSLR)

---

## 1. Executive Summary

During Founder UAT, selecting the **"Black & White" (BnW)** filter failed completely across the end-to-end user journey:
1. **On-Screen Preview** on the download screen remained full color.
2. **Uploaded Asset** (cloud softfile download) remained full color.
3. **Printed Photostrip** ejected by the DNP DS-RX1 remained full color.

### Core Finding
The failure is caused by an **exact dictionary key mismatch** between the React frontend UI and the Electron Sharp rendering engine:
- The UI (`FilterScreen.tsx`) emits filter identifier **`'bw'`**.
- The backend Sharp render dictionary (`RenderEngine.ts`) registered the preset under **`'bw_high_contrast'`** (and **`'grayscale'`**), with no key named **`'bw'`**.
- `RenderEngine.ts:168` executed:
  ```typescript
  const applyFilter = FILTER_PRESETS[filterName] || FILTER_PRESETS.none;
  ```
  Because `FILTER_PRESETS['bw']` is `undefined`, the engine silently fell back to `FILTER_PRESETS.none` (`(img) => img`), compositing the high-resolution strip in 100% unadjusted RGB color.
- Downstream services (`SyncEngine` and `PrintQueueService`) correctly consumed the generated composite file (`composite_*.jpg`), but because `composite_*.jpg` was generated in full color by Sharp, both the upload and print outputs were colored.
- In addition, `QrScreen.tsx:388-403` renders raw camera capture files directly without applying CSS filter styling and without referencing `session.filter`, causing the on-screen preview to also remain colored.

---

## 2. Reproduction Breakdown

| Step | User Action | System Event | Expected State | Actual Observed State | Status |
|:---:|:---|:---|:---|:---|:---:|
| **1** | Select "Black & White" filter on `FilterScreen` | `setSelectedFilter('bw')` | Sample preview shows B&W | CSS filter `grayscale(100%) contrast(115%)` applied to single thumbnail | **PASS (UI Only)** |
| **2** | Click "CETAK SEKARANG (300 DPI) →" | `updateSession({ filter: 'bw' })` | `session.filter = 'bw'` | Stored in memory as `'bw'` | **PASS** |
| **3** | `RenderScreen` triggers composite IPC | `kiosk.render.composite(photos, frameId, 'bw')` | Sharp applies B&W grading | `RenderEngine.ts` receives `filterName = 'bw'` | **PASS** |
| **4** | `RenderEngine.ts` looks up preset | `FILTER_PRESETS['bw']` | Returns B&W filter function | Returns **`undefined`** → falls back to `none` (`(img) => img`) | **FAIL (Break Point 1)** |
| **5** | Composite saved to disk | Sharp composites canvas | `composite_*.jpg` is monochrome | `composite_*.jpg` is 100% full-color RGB | **FAIL** |
| **6** | `QrScreen` renders on-screen photostrip | Mode 1 ("Photo") renders slots | Photostrip preview shows B&W | Renders raw camera photos with no CSS filter | **FAIL (Break Point 2)** |
| **7** | `SyncEngine` uploads composite to cloud | `enqueueUpload(..., 'composite')` | Cloud softfile is B&W | Uploads full-color `composite_*.jpg` | **FAIL (Cascaded)** |
| **8** | `PrintQueueService` prints photostrip | Sends `composite_*.jpg` to DS-RX1 | Physical printout is B&W | Spools full-color `composite_*.jpg` | **FAIL (Cascaded)** |

---

## 3. Runtime Evidence (Founder UAT Test Run)

All evidence was extracted directly from the live kiosk database and file storage generated during the founder's test on `2026-09-22 19:46:00 UTC` (02:46:00 WIB).

### A. Kiosk Local SQLite Evidence (`kiosk.db`)
Query on `sessions` table:
```sql
SELECT id, created_at, frame_id, filter, composite_path, print_status, uploaded 
FROM sessions 
WHERE id = 'session_1790106267801_hlv3tw';
```
**Runtime Result:**
```json
{
  "id": "session_1790106267801_hlv3tw",
  "created_at": "2026-09-22T19:46:00.741Z",
  "frame_id": "classic-white",
  "filter": "bw",
  "composite_path": "C:\\Users\\ezarh\\AppData\\Roaming\\@pictolabs\\kiosk\\pictolabs-data\\composites\\composite_1790106360369.jpg",
  "print_status": "printed",
  "uploaded": 1
}
```
> **Evidence:** `filter: "bw"` was indeed persisted into session data and passed down the pipeline.

---

### B. Upload Queue Evidence (`upload_queue`)
Query on `upload_queue` table:
```sql
SELECT id, session_id, file_path, file_type, status, remote_url 
FROM upload_queue 
WHERE session_id = 'session_1790106267801_hlv3tw' AND file_type = 'composite';
```
**Runtime Result:**
```json
{
  "id": "upload_session_1790106267801_hlv3tw_composite_composite_1790106360369.jpg",
  "session_id": "session_1790106267801_hlv3tw",
  "file_path": "C:\\Users\\ezarh\\AppData\\Roaming\\@pictolabs\\kiosk\\pictolabs-data\\composites\\composite_1790106360369.jpg",
  "file_type": "composite",
  "status": "COMPLETED",
  "remote_url": "https://dl.pictolabs.id/sessions/session_1790106267801_hlv3tw/composite_1790106360369.jpg"
}
```
> **Evidence:** The file uploaded to the cloud is `composite_1790106360369.jpg`.

---

### C. Print Queue Evidence (`print_queue`)
Query on `print_queue` table:
```sql
SELECT id, session_id, file_path, copies, status 
FROM print_queue 
WHERE session_id = 'session_1790106267801_hlv3tw';
```
**Runtime Result:**
```json
{
  "id": "print_1790106363131_1xtr4i",
  "session_id": "session_1790106267801_hlv3tw",
  "file_path": "C:\\Users\\ezarh\\AppData\\Roaming\\@pictolabs\\kiosk\\pictolabs-data\\composites\\composite_1790106360369.jpg",
  "copies": 1,
  "status": "COMPLETED"
}
```
> **Evidence:** The file sent to the physical DNP DS-RX1 printer is `composite_1790106360369.jpg`.

---

### D. Pixel Color Channel Statistics (Mathematical Proof)
Using Sharp image statistics on the exact file rendered by the kiosk (`composite_1790106360369.jpg`):

#### Actual Output (`composite_1790106360369.jpg` — Filter: `'bw'`):
```text
Channel 0 (Red):   Mean = 187.42, Stdev = 93.27
Channel 1 (Green): Mean = 183.08, Stdev = 96.14
Channel 2 (Blue):  Mean = 179.50, Stdev = 98.93
```
*Mathematical Interpretation:* The Red, Green, and Blue channels have noticeably different mean intensities (187.42 vs 183.08 vs 179.50). This proves conclusively that color saturation is active and **the image was rendered in full RGB color**.

#### Control Benchmark (Identical source photo with `bw_high_contrast` applied):
```text
Channel 0 (Red):   Mean = 121.60, Stdev = 96.38
Channel 1 (Green): Mean = 121.60, Stdev = 96.38
Channel 2 (Blue):  Mean = 121.60, Stdev = 96.38
```
*Mathematical Interpretation:* When grayscale/B&W is applied, $R = G = B$ across every pixel down to 14 decimal places.

---

## 4. End-to-End Pipeline Trace

```
[1. User on FilterScreen]
      │
      ▼ Selects "Black & White" (id: 'bw')
[2. Filter State]
      │ `selectedFilter = 'bw'`
      ▼ `updateSession({ filter: 'bw' })`
[3. Session Data]
      │ `session.filter = 'bw'`
      ▼ `RenderScreen.tsx` calls `kiosk.render.composite(photos, frameId, 'bw')`
[4. Render Engine IPC]
      │ `RenderEngine.ts: compositePhotos(..., filterName = 'bw', ...)`
      ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ FILTER LOOKUP:                                              │
   │ `const applyFilter = FILTER_PRESETS['bw'] || FILTER_PRESETS.none;` │
   │                                                             │
   │ FILTER_PRESETS keys: ['none', 'grayscale', 'sepia', 'warm', │
   │                       'cool', 'vivid', 'bw_high_contrast']  │
   │                                                             │
   │ FILTER_PRESETS['bw'] === undefined !                        │
   │ 💥 BREAK POINT 1: Falls back to FILTER_PRESETS.none ((i) => i)│
   └─────────────────────────────────────────────────────────────┘
      │
      ▼ Sharp processes photos with NO filter applied (Full Color)
[5. Generated Composite Asset]
      │ Saved to `composites/composite_1790106360369.jpg` (Full Color RGB)
      │
      ├──────────────────────────────┬─────────────────────────────┐
      ▼                              ▼                             ▼
[6. On-Screen Preview]      [7. Upload Asset]             [8. Print Asset]
   `QrScreen.tsx`              `SyncEngine.ts`               `PrintQueueService.ts`
   Renders raw photos          Uploads `composite_*.jpg`     Spools `composite_*.jpg`
   without CSS filter          to Cloudflare / MinIO         to DNP DS-RX1
   💥 BREAK POINT 2            💥 OUTPUT: Full Color Softfile 💥 OUTPUT: Full Color Paper
```

---

## 5. Filter Value Comparison Matrix

Comparison between UI Filter IDs (`FilterScreen.tsx`) and Sharp Presets (`RenderEngine.ts`):

| UI Display Name | `FilterScreen.tsx` (`id`) | `FilterScreen.tsx` CSS (`filterStyle`) | `RenderEngine.ts` Key | Preset Exists? | Render Output | Status |
|:---|:---:|:---|:---:|:---:|:---|:---:|
| **Original Studio** | `'original'` | `none` | `'none'` | ❌ (`'original'` not in dict) | Full color | Works by coincidence (fallback to `none`) |
| **Black & White** | `'bw'` | `grayscale(100%) contrast(115%)` | `'bw_high_contrast'` / `'grayscale'` | ❌ (`'bw'` not in dict) | Full color | **CRITICAL BUG (Founder UAT Fail)** |
| **Warm Retro** | `'sepia'` | `sepia(60%) saturate(130%)` | `'sepia'` | ✅ | Sepia Tint | Works |
| **Vivid Pop** | `'vivid'` | `saturate(170%) contrast(110%)` | `'vivid'` | ✅ | High Saturation | Works |
| **Cool Film** | `'cool'` | `hue-rotate(180deg) saturate(110%)` | `'cool'` | ✅ | Cool Film Tint | Works |
| **90s Nostalgia** | `'vintage'` | `contrast(90%) brightness(110%) saturate(85%)` | *None* (has `'warm'`) | ❌ (`'vintage'` not in dict) | Full color | **CRITICAL BUG (Will fail similarly)** |

---

## 6. Exact Break Points in Source Code

### Break Point 1: `apps/kiosk/electron/services/RenderEngine.ts` (Lines 83–96 & 168)
```typescript
// RenderEngine.ts:83-96
const FILTER_PRESETS: Record<string, (img: Sharp) => Sharp> = {
  none: (img) => img,
  grayscale: (img) => img.grayscale(),
  sepia: (img) =>
    img.tint({ r: 112, g: 66, b: 20 }),
  warm: (img) =>
    img.modulate({ saturation: 1.2 }).tint({ r: 255, g: 200, b: 150 }),
  cool: (img) =>
    img.modulate({ saturation: 0.9 }).tint({ r: 150, g: 200, b: 255 }),
  vivid: (img) =>
    img.modulate({ saturation: 1.5, brightness: 1.05 }),
  bw_high_contrast: (img) =>
    img.grayscale().linear(1.4, -30),
};

// RenderEngine.ts:168
const applyFilter = FILTER_PRESETS[filterName] || FILTER_PRESETS.none;
```
When `filterName = 'bw'`:
`FILTER_PRESETS['bw']` is `undefined`.  
`applyFilter` evaluates to `FILTER_PRESETS.none`.  
Raw photo buffers are saved into composite without any Sharp transformation.

---

### Break Point 2: `apps/kiosk/src/screens/QrScreen.tsx` (Lines 388–403)
```tsx
// QrScreen.tsx:388-403
{/* MODE 1: PHOTO (Shows 3 Captured Photos Still) */}
{previewMode === 'photo' && (
  <>
    {sessionPhotos.slice(0, 3).map((photoUrl, idx) => (
      <div
        key={idx}
        className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-slate-900 shadow-sm border border-black/10 relative"
      >
        <img
          src={photoUrl}
          alt={`Pose ${idx + 1}`}
          className="w-full h-full object-cover"
        />
      </div>
    ))}
  </>
)}
```
`QrScreen.tsx` does two things wrong:
1. It displays `sessionPhotos.slice(0, 3)` (raw camera captures) instead of `session.compositeUrl` (the rendered composite strip).
2. It does not look up `session.filter` or apply any CSS `filter` style to the `<img>` elements. Consequently, the preview frame displays the raw color camera capture files regardless of what filter was chosen.

---

## 7. Render Input vs Render Output

### Render Input
- **API Call:** `kiosk.render.composite(cleanPhotos, frameId, filter)`
- **`cleanPhotos`:**
  - `photo_session_1790106267801_hlv3tw_pose_1.jpg`
  - `photo_session_1790106267801_hlv3tw_pose_2.jpg`
  - `photo_session_1790106267801_hlv3tw_pose_3.jpg`
- **`frameId`:** `'classic-white'`
- **`filter`:** `'bw'`

### Render Output
- **Target File:** `composite_1790106360369.jpg`
- **Resolution:** $1200 \times 1800$ pixels @ 300 DPI
- **Expected Color Channels:** 1 channel (grayscale) or 3 identical channels ($R = G = B$)
- **Actual Color Channels:** 3 independent RGB channels ($R \neq G \neq B$)
- **Visual Appearance:** Full color original (identical to `'original'` preset)

---

## 8. Proposed Fix (Do Not Implement Yet)

### Fix Part A: Align Filter Dictionary in `RenderEngine.ts`
Map all frontend filter IDs directly into `FILTER_PRESETS` in `RenderEngine.ts`:
```typescript
const FILTER_PRESETS: Record<string, (img: Sharp) => Sharp> = {
  // Canonical UI IDs
  none: (img) => img,
  original: (img) => img,
  bw: (img) => img.grayscale().linear(1.4, -30),
  sepia: (img) => img.tint({ r: 112, g: 66, b: 20 }),
  vivid: (img) => img.modulate({ saturation: 1.5, brightness: 1.05 }),
  cool: (img) => img.modulate({ saturation: 0.9 }).tint({ r: 150, g: 200, b: 255 }),
  vintage: (img) => img.modulate({ saturation: 0.85, brightness: 1.1 }).linear(0.9, 10),

  // Backward-compatibility aliases
  grayscale: (img) => img.grayscale(),
  bw_high_contrast: (img) => img.grayscale().linear(1.4, -30),
  warm: (img) => img.modulate({ saturation: 1.2 }).tint({ r: 255, g: 200, b: 150 }),
};
```

### Fix Part B: Align UI Preview in `QrScreen.tsx`
In `QrScreen.tsx`, map the selected session filter to CSS filter style so the on-screen mockup accurately reflects the filter:
```typescript
const FILTER_STYLES: Record<string, string> = {
  original: 'none',
  none: 'none',
  bw: 'grayscale(100%) contrast(115%)',
  sepia: 'sepia(60%) saturate(130%)',
  vivid: 'saturate(170%) contrast(110%)',
  cool: 'hue-rotate(180deg) saturate(110%)',
  vintage: 'contrast(90%) brightness(110%) saturate(85%)',
};
```
Apply `style={{ filter: FILTER_STYLES[session.filter || 'none'] || 'none' }}` to preview `<img />` tags, OR if `previewMode === 'photo'` and `session.compositeUrl` exists, offer direct composite preview.

---

## 9. Verification & Audit Sign-Off

- [x] Founder UAT failure reproduced and verified in code.
- [x] Live database records inspected (`kiosk.db` session `session_1790106267801_hlv3tw`).
- [x] RGB channel statistics measured via Sharp on the founder's generated composite.
- [x] Exact code line numbers isolated in `RenderEngine.ts` and `QrScreen.tsx`.
- [x] Downstream cascade through `SyncEngine` and `PrintQueueService` verified.
- [x] Implementation blocked pending founder approval (`Do not implement yet`).
