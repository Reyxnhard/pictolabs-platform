# LAPORAN IMPLEMENTASI & VERIFIKASI PERBAIKAN ADMIN PIN AUTHENTICATION

**Dokumen Referensi**: `ADMIN_PIN_FIX_REPORT.md`  
**Target Milestone**: Kiosk Operator Security & Fleet Stabilization  
**Tanggal Verifikasi**: 23 September 2026  
**Status**: **100% VERIFIED & RESOLVED (ALL PASS)**  
**Sasaran**: Kiosk AdminScreen wajib memverifikasi PIN menggunakan `apiBaseUrl` dan `boothId` teraktivasi dari `IdentityService`, mengeliminasi fallback `localhost:4000`, meluluskan PIN Dashboard aktif (`112233`), serta menolak PIN yang salah.

---

## 1. Ringkasan Eksekutif & Hasil Verifikasi

Semua 4 kriteria kelulusan terpenuhi 100%:

| Kriteria Uji | Kondisi Pengujian | Hasil Aktual Runtime | Status |
| :--- | :--- | :--- | :---: |
| **1. Target Host Produksi** | Menggunakan `apiBaseUrl` dari Kiosk Identity (`identity.json`) | `https://api.pictolabs.id` | **PASS ✓** |
| **2. Target Identifier Booth** | Menggunakan `boothId` canonical dari Kiosk Identity | `554147f9-c7f7-47fe-966d-fcbf3223fec4` | **PASS ✓** |
| **3. Eliminasi Fallback Localhost** | Runtime produksi tidak boleh menghubungi `localhost:4000` | Nol request ke `localhost:4000` | **PASS ✓** |
| **4. Login PIN Dashboard (`112233`)** | Masukkan PIN aktif hasil update dari Dashboard | **HTTP 200 `{ verified: true }`** → **Login Sukses** | **PASS ✓** |
| **5. Penolakan PIN Salah (`885926`)** | Masukkan PIN lama / salah | **HTTP 200 `{ verified: false }`** → **Keypad Terkunci** | **PASS ✓** |

---

## 2. Perubahan Kode Sumber (`apps/kiosk/src/screens/AdminScreen.tsx`)

Perubahan difokuskan secara presisi hanya pada [`AdminScreen.tsx`](file:///c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs/pictolabs-rebuild/apps/kiosk/src/screens/AdminScreen.tsx) tanpa menyentuh modul lain.

### Perubahan 1: Resolusi Identitas Otoritatif dari `kiosk.identity`
```typescript
// Sebelum:
const backendUrl = ((import.meta as any).env?.VITE_BACKEND_URL as string) || 'http://localhost:4000';
const boothIdentifier = (config as any)?.deviceSecret || 'dev-secret-booth-01';

// Sesudah:
const [pairedIdentity, setPairedIdentity] = useState<{ boothId?: string | null; apiBaseUrl?: string | null } | null>(null);

useEffect(() => {
  kiosk.identity?.getStatus?.().then((status) => {
    if (status && status.isPaired) {
      setPairedIdentity({
        boothId: status.boothId,
        apiBaseUrl: status.apiBaseUrl,
      });
    }
  }).catch((err) => {
    console.warn('[AdminScreen] Failed to read identity status:', err);
  });
}, []);

const resolveTargetEndpoint = async () => {
  let activeId = pairedIdentity;
  if (!activeId?.boothId || !activeId?.apiBaseUrl) {
    try {
      const status = await kiosk.identity?.getStatus?.();
      if (status && status.isPaired) {
        activeId = {
          boothId: status.boothId,
          apiBaseUrl: status.apiBaseUrl,
        };
        setPairedIdentity(activeId);
      }
    } catch (_) {}
  }

  const isDev = Boolean((import.meta as any).env?.DEV);
  const backendUrl =
    activeId?.apiBaseUrl ||
    (config as any)?.apiBaseUrl ||
    ((import.meta as any).env?.VITE_BACKEND_URL as string) ||
    (isDev ? 'http://localhost:4000' : '');

  const boothIdentifier =
    activeId?.boothId ||
    (config as any)?.boothId ||
    (config as any)?.deviceSecret ||
    (isDev ? 'dev-secret-booth-01' : '');

  return { backendUrl, boothIdentifier, isDev };
};
```

### Perubahan 2: Proteksi `verifyPin` & Eliminasi Fallback Localhost
```typescript
const verifyPin = async (candidate: string) => {
  if (lockoutSeconds > 0 || isVerifying) return;
  setIsVerifying(true);

  try {
    const { backendUrl, boothIdentifier, isDev } = await resolveTargetEndpoint();

    if (!backendUrl || !boothIdentifier) {
      console.error('[AdminScreen] PIN verification halted: missing backendUrl or boothIdentifier in production runtime', {
        backendUrl,
        boothIdentifier,
        isDev,
      });
      setPinError(true);
      setTimeout(() => {
        setPin('');
        setPinError(false);
      }, 800);
      return;
    }

    const res = await fetch(`${backendUrl}/api/booths/${boothIdentifier}/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: candidate }),
    });

    const data = await res.json().catch(() => ({ verified: false }));

    if (res.ok && data.verified) {
      setIsAuthenticated(true);
      setPinError(false);
      setFailedAttempts(0);
    } else {
      // Keypad error animation & brute force 10-minute lockout logic
```

---

## 3. Bukti Runtime & Rekaman Jaringan (Chrome DevTools Protocol)

Pengujian dieksekusi langsung pada proses biner Kiosk terpaket (`release\win-unpacked\Pictolabs Kiosk.exe`) dengan identitas terpasang di `C:\ProgramData\Pictolabs\identity.json`.

```text
[18:11:49.335] ====================================================
[18:11:49.335]   ADMIN PIN RUNTIME VERIFICATION ON PAIRED KIOSK
[18:11:49.335] ====================================================
[18:11:49.336] 1. Cleaning up previous kiosk processes...
[18:11:49.515] 2. Launching packaged Kiosk binary with remote debugging port 9222...
[18:11:53.526] 3. Connecting to Kiosk Chromium renderer via CDP...
[18:11:53.593] Connected to target: "Pictolabs Kiosk" (file:///C:/Users/ezarh/.../dist/renderer/index.html)
[18:11:53.618] 4. Verifying window.kiosk.identity.getStatus() in renderer...
[18:11:53.619] ✓ Kiosk Identity: isPaired=true, boothId="554147f9-c7f7-47fe-966d-fcbf3223fec4", apiBaseUrl="https://api.pictolabs.id"
[18:11:53.620] 5. Clicking Staff button (#btn-kiosk-admin-entry) on WelcomeScreen...
[18:11:54.638] 6. Capturing screenshot of AdminScreen PIN pad...
[18:11:54.713] ✓ Saved screenshot to uat_admin_pin_pad.png
[18:11:54.713] 7. Testing Wrong PIN: 885926...
[18:11:55.239] 🌐 [CDP NETWORK REQUEST] POST https://api.pictolabs.id/api/booths/554147f9-c7f7-47fe-966d-fcbf3223fec4/verify-pin -> Body: {"pin":"885926"}
[18:11:55.580] 🌐 [CDP NETWORK RESPONSE] 200 OK for https://api.pictolabs.id/api/booths/554147f9-c7f7-47fe-966d-fcbf3223fec4/verify-pin
[18:11:57.359] ✓ Wrong PIN rejected, AdminScreen remains locked: true
[18:11:57.359] 8. Testing Correct Dashboard PIN: 112233...
[18:11:57.879] 🌐 [CDP NETWORK REQUEST] POST https://api.pictolabs.id/api/booths/554147f9-c7f7-47fe-966d-fcbf3223fec4/verify-pin -> Body: {"pin":"112233"}
[18:11:58.011] 🌐 [CDP NETWORK RESPONSE] 200 OK for https://api.pictolabs.id/api/booths/554147f9-c7f7-47fe-966d-fcbf3223fec4/verify-pin
[18:12:00.487] 🎯 Login with PIN 112233 Result: AUTHENTICATED SUCCESSFUL ✓
[18:12:00.487] 9. Capturing screenshot of Authenticated Admin Panel...
[18:12:00.574] ✓ Saved screenshot to uat_admin_panel_authenticated.png
[18:12:00.574] ====================================================
[18:12:00.574]   VERIFICATION SUMMARY
[18:12:00.574] ====================================================
[18:12:00.574] 1. Correct API URL Used: PASS ✓
[18:12:00.574] 2. Localhost Fallback Eliminated: PASS ✓
[18:12:00.574] 3. Wrong PIN (885926) Rejected: PASS ✓
[18:12:00.574] 4. Correct PIN (112233) Authenticated: PASS ✓
[18:12:00.574] ====================================================
```

---

## 4. Bukti Visual Runtime

### A. Tampilan Keypad Operator (Saat PIN Salah Dimasukkan)
Saat PIN salah (`885926`) dimasukkan, request dikirim ke backend dan menerima `{ verified: false }`. Keypad tetap terkunci di layar input PIN:

![Keypad Akses Operator Kiosk](C:\Users\ezarh\.gemini\antigravity-ide\brain\13fa350d-ea7f-4ff5-b3ec-85f5a90a0625\uat_admin_pin_pad.png)

---

### B. Tampilan Sukses Login Operator (PIN `112233`)
Saat PIN `112233` dimasukkan, backend merespons `{ verified: true }`. Layar langsung terbuka menuju **OPERATOR CONTROL PANEL V1.0 ENTERPRISE** secara penuh:

![Operator Control Panel Terbuka Sukses](C:\Users\ezarh\.gemini\antigravity-ide\brain\13fa350d-ea7f-4ff5-b3ec-85f5a90a0625\uat_admin_panel_authenticated.png)

---

## 5. Kesimpulan Akhir

1. **Masalah Teratasi Sepenuhnya**: `AdminScreen` kini secara dinamis membaca `apiBaseUrl` (`https://api.pictolabs.id`) dan `boothId` (`554147f9-c7f7-47fe-966d-fcbf3223fec4`) dari `IdentityService` lokal.
2. **Tidak Ada Ketergantungan Localhost**: Kiosk tidak lagi mencoba menghubungi `http://localhost:4000` di lingkungan produksi.
3. **Sinkronisasi PIN Berfungsi Penuh**: Perubahan PIN teknisi di Admin Dashboard (`112233`) langsung dapat digunakan untuk membuka panel teknisi di layar fisik kios.
