import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Printer,
  Camera,
  Scissors,
  RotateCcw,
  LogOut,
  X,
  RefreshCw,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Lock,
  FlipHorizontal,
  CreditCard,
  Zap,
} from 'lucide-react';
import { kiosk, PrinterHealth, CameraStatus } from '../ipc/bridge';
import { useKioskConfig } from '../context/KioskConfigContext';

interface AdminScreenProps {
  onClose: () => void;
}

export default function AdminScreen({ onClose }: AdminScreenProps) {
  const { config, updateLocalConfig } = useKioskConfig();
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [masterPin, setMasterPin] = useState('885926');
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);

  // Hardware Health States
  const [printerHealth, setPrinterHealth] = useState<PrinterHealth | null>(null);
  const [cameraInfo, setCameraInfo] = useState<CameraStatus | null>(null);
  const [isRefreshingPrinter, setIsRefreshingPrinter] = useState(false);
  const [lastSession, setLastSession] = useState<any>(null);
  const [isBypassMode, setIsBypassMode] = useState(() => {
    return typeof window !== 'undefined' && localStorage.getItem('pictolabs-bypass-printer') !== 'false';
  });

  // Payment Bypass States
  const [activeOrderId, setActiveOrderId] = useState<string | null>(() => {
    return typeof window !== 'undefined' ? localStorage.getItem('pictolabs-active-order-id') : null;
  });
  const [isAutoBypassPayment, setIsAutoBypassPayment] = useState(() => {
    return typeof window !== 'undefined' && localStorage.getItem('pictolabs-auto-bypass-payment') === 'true';
  });
  const [customOrderId, setCustomOrderId] = useState('');
  const [isBypassing, setIsBypassing] = useState(false);

  // Camera LiveView test
  const [isLiveViewActive, setIsLiveViewActive] = useState(false);
  const [liveViewFrame, setLiveViewFrame] = useState<string | null>(null);

  // Operator Action Feedback
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);

  // Touch In-App Confirmation Modal State
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmText: string;
    confirmColor?: string;
    onConfirm: () => void;
  } | null>(null);

  // ─── Fetch Configured Admin PIN on Mount ────────────────────
  useEffect(() => {
    kiosk.config
      .get()
      .then((cfg: any) => {
        if (cfg?.adminPin && typeof cfg.adminPin === 'string') {
          setMasterPin(cfg.adminPin);
        }
      })
      .catch((err) => {
        console.warn('[AdminScreen] Could not read local config for adminPin:', err);
      });
  }, []);

  // ─── Lockout Countdown Timer ───────────────────────────────
  useEffect(() => {
    if (lockoutSeconds <= 0) return;
    const interval = setInterval(() => {
      setLockoutSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [lockoutSeconds]);

  // ─── PIN Pad Logic (6-Digit Hardened Security) ─────────────
  const handleDigit = (digit: string) => {
    if (lockoutSeconds > 0) return;
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length === 6) {
        verifyPin(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    if (lockoutSeconds > 0) return;
    setPin((prev) => prev.slice(0, -1));
    setPinError(false);
  };

  const verifyPin = async (candidate: string) => {
    if (lockoutSeconds > 0) return;
    if (candidate === masterPin) {
      setIsAuthenticated(true);
      setPinError(false);
      setFailedAttempts(0);
    } else {
      const nextFails = failedAttempts + 1;
      setFailedAttempts(nextFails);
      setPinError(true);

      if (nextFails >= 3) {
        setLockoutSeconds(600); // 10 minutes lockout (600s)
        setFailedAttempts(0);

        // Dispatch WhatsApp Alert to Admin
        try {
          const backendUrl = ((import.meta as any).env?.VITE_BACKEND_URL as string) || 'http://localhost:4000';
          await fetch(`${backendUrl}/api/alerts/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              severity: 'CRITICAL',
              type: 'ERR_KIOSK_PIN_BRUTE_FORCE',
              title: 'Percobaan Akses Ilegal Panel Teknisi',
              detail: '3 kali berturut-turut memasukkan PIN salah pada layar kios. Keypad dikunci selama 10 menit.',
              action: 'Periksa kamera CCTV booth dan pastikan tidak ada pihak yang mencoba membobol sistem.',
            }),
          });
        } catch (e) {
          console.warn('[AdminScreen] Failed to dispatch brute force alert:', e);
        }
      }

      setTimeout(() => {
        setPin('');
        setPinError(false);
      }, 800);
    }
  };

  // ─── Fetch Diagnostics ─────────────────────────────────────
  const refreshDiagnostics = useCallback(async () => {
    setIsRefreshingPrinter(true);
    try {
      const [health, latest, camStatus] = await Promise.all([
        kiosk.printer.getHealth().catch(() => null),
        kiosk.session.getLast().catch(() => null),
        kiosk.camera.getStatus().catch(() => null),
      ]);
      setPrinterHealth(health);
      setLastSession(latest);
      setCameraInfo(camStatus);
    } catch (err: any) {
      console.error('[AdminScreen] Error fetching diagnostics:', err);
    } finally {
      setIsRefreshingPrinter(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      refreshDiagnostics();
    }
  }, [isAuthenticated, refreshDiagnostics]);

  // ─── Camera LiveView Stream Listener ───────────────────────
  useEffect(() => {
    if (!isAuthenticated || !isLiveViewActive) return;

    let unsubscribe: (() => void) | undefined;
    kiosk.camera
      .startLiveView()
      .then(() => {
        unsubscribe = kiosk.camera.onLiveViewFrame((frameData) => {
          if (!frameData) return;
          const validSrc = frameData.startsWith('data:')
            ? frameData
            : `data:image/jpeg;base64,${frameData}`;
          setLiveViewFrame(validSrc);
        });
      })
      .catch((err) => {
        console.error('[AdminScreen] Failed to start LiveView:', err);
        setActionMessage({ text: `Gagal membuka LiveView: ${err.message}`, type: 'error' });
        setIsLiveViewActive(false);
      });

    return () => {
      if (unsubscribe) unsubscribe();
      kiosk.camera.stopLiveView().catch(() => {});
      setLiveViewFrame(null);
    };
  }, [isAuthenticated, isLiveViewActive]);

  // ─── Operator Action Handlers ──────────────────────────────
  const showToast = (text: string, type: 'success' | 'error') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 4000);
  };

  const handleUpdateMirror = (key: 'cameraPreview' | 'cameraResult', value: 'mirror' | 'original') => {
    updateLocalConfig({ [key]: value });
    const label = key === 'cameraPreview' ? 'Mirror Preview Layar' : 'Mirror Hasil Foto & Live Photo';
    showToast(
      `✓ Konfigurasi ${label} diatur ke: ${value === 'mirror' ? 'Mirror (Cermin)' : 'Original (Sensor Asli)'}`,
      'success'
    );
  };

  const handleReprint = async () => {
    setIsActionPending(true);
    try {
      const result = await kiosk.printer.reprintLast();
      if (result.success) {
        showToast('✓ Berhasil mengirim ulang cetakan foto ke printer!', 'success');
      } else {
        showToast(`✗ Gagal mencetak ulang: ${result.error || 'Terjadi kesalahan spooler'}`, 'error');
      }
    } catch (err: any) {
      showToast(`✗ Error: ${err.message}`, 'error');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleCutTest = async () => {
    setIsActionPending(true);
    try {
      const result = await kiosk.printer.cutTest();
      if (result.success) {
        showToast('✓ Perintah tes pemotong kertas (cut test) berhasil dikirim!', 'success');
      } else {
        showToast(`✗ Gagal uji potong: ${result.error || 'Printer error'}`, 'error');
      }
    } catch (err: any) {
      showToast(`✗ Error: ${err.message}`, 'error');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleToggleBypass = async () => {
    const next = !isBypassMode;
    setIsBypassMode(next);
    localStorage.setItem('pictolabs-bypass-printer', String(next));
    try {
      if (kiosk.printer.setBypass) {
        await kiosk.printer.setBypass(next);
      }
      showToast(
        next ? '✓ Mode Bypass diaktifkan (Simulasi dev)' : '✓ Mode Bypass dimatikan (Hardware gate fisik aktif)',
        'success'
      );
      const h = await kiosk.printer.getHealth();
      setPrinterHealth(h);
    } catch (err: any) {
      showToast(`Gagal mengubah mode bypass: ${err.message}`, 'error');
    }
  };

  const handleBypassPayment = async (orderIdToBypass?: string) => {
    const targetId = orderIdToBypass || activeOrderId || customOrderId;
    if (!targetId) {
      showToast('Tidak ada transaksi/order ID aktif untuk di-bypass', 'error');
      return;
    }

    setIsBypassing(true);
    try {
      const backendUrl = ((import.meta as any).env?.VITE_BACKEND_URL as string) || 'http://localhost:4000';
      const res = await fetch(`${backendUrl}/api/payments/simulate/${targetId.trim()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        showToast(`✓ Berhasil mem-bypass pembayaran (${targetId})! Transaksi lunas.`, 'success');
        localStorage.removeItem('pictolabs-active-order-id');
        setActiveOrderId(null);
      } else {
        const text = await res.text();
        showToast(`✗ Gagal mem-bypass: ${text || 'Server error'}`, 'error');
      }
    } catch (err: any) {
      showToast(`✗ Gagal menghubungi server: ${err.message}`, 'error');
    } finally {
      setIsBypassing(false);
    }
  };

  const handleToggleAutoBypassPayment = () => {
    const next = !isAutoBypassPayment;
    setIsAutoBypassPayment(next);
    localStorage.setItem('pictolabs-auto-bypass-payment', String(next));
    showToast(
      next
        ? '✓ Auto-Bypass Pembayaran DIAKTIFKAN (Otomatis sukses saat masuk layar QRIS)'
        : '✓ Auto-Bypass Pembayaran DINONAKTIFKAN (Menunggu pembayaran scan manual)',
      'success'
    );
  };

  const handleRestartKiosk = () => {
    setConfirmDialog({
      title: 'Restart Aplikasi Kiosk',
      message: 'Apakah Anda yakin ingin memuat ulang (restart) aplikasi Kiosk sekarang? Jendela booth akan dimuat ulang.',
      confirmText: 'Restart Kiosk',
      confirmColor: 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30',
      onConfirm: async () => {
        await kiosk.system.restartKiosk();
      },
    });
  };

  const handleExitKiosk = () => {
    setConfirmDialog({
      title: 'Keluar ke Desktop Windows',
      message: 'Apakah Anda yakin ingin menutup aplikasi Kiosk dan kembali ke Desktop Windows?',
      confirmText: 'Keluar ke Windows',
      confirmColor: 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30',
      onConfirm: async () => {
        await kiosk.system.exitKiosk();
      },
    });
  };

  // ─── PIN Pad View (Unauthenticated) ────────────────────────
  if (!isAuthenticated) {
    const isLocked = lockoutSeconds > 0;

    return (
      <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in select-none">
        <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center relative text-white">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-16 h-16 rounded-2xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center mb-4">
            {isLocked ? <Lock className="w-8 h-8 text-rose-400 animate-pulse" /> : <ShieldCheck className="w-8 h-8" />}
          </div>

          <h2 className="text-xl font-bold tracking-tight">OPERATOR ACCESS</h2>
          <p className="text-xs text-slate-400 mt-1 mb-6 text-center">
            {isLocked ? 'Keypad dinonaktifkan sementara (10 menit)' : 'Masukkan 6-digit PIN Teknisi untuk masuk'}
          </p>

          {/* Lockout Warning Banner */}
          {isLocked ? (
            <div className="w-full bg-rose-950/80 border border-rose-500/50 rounded-2xl p-4 mb-6 text-center animate-pulse">
              <AlertTriangle className="w-6 h-6 text-rose-400 mx-auto mb-1" />
              <h3 className="font-bold text-sm text-rose-200">KEYPAD TERKUNCI</h3>
              <p className="text-xs text-rose-300 mt-1">
                Terlalu banyak percobaan gagal. Silakan tunggu{' '}
                <span className="font-mono font-bold text-white text-sm">{lockoutSeconds}</span> detik.
              </p>
            </div>
          ) : (
            /* PIN Indicators (6 Digits) */
            <div className={`flex gap-3 mb-8 ${pinError ? 'animate-shake' : ''}`}>
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <div
                  key={idx}
                  className={`w-3.5 h-3.5 rounded-full border-2 transition-all duration-200 ${
                    pin.length > idx
                      ? pinError
                        ? 'bg-rose-500 border-rose-500 scale-110'
                        : 'bg-blue-500 border-blue-500 scale-110'
                      : 'border-slate-700 bg-slate-800'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Keypad Grid */}
          <div className={`grid grid-cols-3 gap-3 w-full max-w-[280px] ${isLocked ? 'opacity-40 pointer-events-none' : ''}`}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                disabled={isLocked}
                onClick={() => handleDigit(digit)}
                className="h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:scale-95 disabled:pointer-events-none text-2xl font-semibold transition-all border border-slate-700/60"
              >
                {digit}
              </button>
            ))}
            <button
              disabled={isLocked}
              onClick={() => setPin('')}
              className="h-16 rounded-2xl bg-slate-800/40 hover:bg-slate-800 text-xs font-bold uppercase tracking-wider text-slate-400 transition-colors"
            >
              CLEAR
            </button>
            <button
              disabled={isLocked}
              onClick={() => handleDigit('0')}
              className="h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-2xl font-semibold transition-all border border-slate-700/60"
            >
              0
            </button>
            <button
              disabled={isLocked}
              onClick={handleBackspace}
              className="h-16 rounded-2xl bg-slate-800/40 hover:bg-slate-800 text-xs font-bold uppercase tracking-wider text-slate-400 transition-colors"
            >
              ⌫
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Authenticated Operator Admin Dashboard ────────────────
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-2xl flex flex-col p-8 text-white select-none overflow-y-auto animate-fade-in">
      {/* Touch In-App Confirmation Modal */}
      {confirmDialog && (
        <div className="fixed inset-0 z-60 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-6 select-none animate-fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col text-white">
            <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              {confirmDialog.title}
            </h3>
            <p className="text-sm text-slate-400 mb-6 leading-relaxed">{confirmDialog.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-semibold transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  const action = confirmDialog.onConfirm;
                  setConfirmDialog(null);
                  action();
                }}
                className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg ${
                  confirmDialog.confirmColor || 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                }`}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-6 mb-8 max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
              OPERATOR CONTROL PANEL
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono font-medium">
                V1.0 ENTERPRISE
              </span>
            </h1>
            <p className="text-xs text-slate-400">Diagnostik Hardware, Kontrol Spooler & Pemeliharaan Booth</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={refreshDiagnostics}
            disabled={isRefreshingPrinter}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-medium transition-colors border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshingPrinter ? 'animate-spin' : ''}`} />
            Perbarui Status
          </button>
          <button
            onClick={onClose}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm transition-all shadow-lg shadow-blue-600/30"
          >
            <X className="w-4 h-4" />
            Kembali ke Booth
          </button>
        </div>
      </div>

      {/* Live Toast Notification */}
      {actionMessage && (
        <div className="max-w-6xl w-full mx-auto mb-6">
          <div
            className={`p-4 rounded-2xl flex items-center gap-3 border shadow-lg ${
              actionMessage.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                : 'bg-rose-950/80 border-rose-500/50 text-rose-300'
            }`}
          >
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{actionMessage.text}</span>
          </div>
        </div>
      )}

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl w-full mx-auto flex-1">
        {/* Hardware Status: Printer */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Thermal Printer</h3>
                  <p className="text-xs text-slate-400">{printerHealth?.name || 'Mendeteksi printer...'}</p>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  printerHealth?.ready
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse'
                }`}
              >
                {printerHealth?.ready ? '✓ SIAP' : `⚠️ ${printerHealth?.code || 'ERROR'}`}
              </span>
            </div>

            <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800/80 mb-6 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Pesan Status:</span>
                <span className="font-semibold text-slate-200">{printerHealth?.message || 'Siap'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Kode Deteksi:</span>
                <span className="font-mono text-slate-200">{printerHealth?.code || 'OK'}</span>
              </div>
            </div>

            {/* Mode Bypass Printer Toggle Bar */}
            <div className="bg-slate-950/70 rounded-2xl p-3.5 border border-slate-800/90 mb-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={`w-3 h-3 rounded-full ${
                    isBypassMode ? 'bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50' : 'bg-slate-600'
                  }`}
                />
                <div>
                  <div className="text-xs font-bold text-slate-200">Mode Bypass Printer</div>
                  <div className="text-[11px] text-slate-400">
                    {isBypassMode
                      ? 'Simulasi aktif (bisa tes tanpa printer fisik)'
                      : 'Gate hardware aktif (mengecek kertas & USB)'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleBypass}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-md flex items-center gap-1.5 ${
                  isBypassMode
                    ? 'bg-emerald-600/30 border-emerald-500/50 text-emerald-300 hover:bg-emerald-600/50'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isBypassMode ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                {isBypassMode ? 'AKTIF' : 'NONAKTIF'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={handleReprint}
              disabled={isActionPending}
              className="py-3.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-600/20"
            >
              <RotateCcw className="w-4 h-4" />
              Cetak Ulang Foto Terakhir
            </button>
            <button
              onClick={handleCutTest}
              disabled={isActionPending}
              className="py-3.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:scale-95 disabled:opacity-50 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-slate-700"
            >
              <Scissors className="w-4 h-4" />
              Uji Potong (Cut Test)
            </button>
          </div>
        </div>

        {/* Hardware Status: Camera */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Sensor Kamera</h3>
                  <p className="text-xs text-slate-400">
                    {cameraInfo?.cameraModel || (cameraInfo?.isCanonConnected ? 'Canon EOS Camera (EDSDK 13.x)' : 'Webcam Standby')}
                  </p>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  cameraInfo?.isCanonConnected
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                }`}
              >
                {cameraInfo?.isCanonConnected ? '✓ CANON DSLR' : 'WEBCAM BACKUP'}
              </span>
            </div>

            {/* LiveView Test Window */}
            <div className="w-full h-36 rounded-2xl bg-black border border-slate-800 overflow-hidden flex items-center justify-center relative mb-4">
              {isLiveViewActive && liveViewFrame ? (
                <img
                  src={liveViewFrame}
                  alt="LiveView Viewfinder"
                  className={`w-full h-full object-cover ${config.cameraPreview !== 'original' ? '-scale-x-100' : ''}`}
                />
              ) : (
                <div className="text-center p-4">
                  <Camera className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 font-medium">
                    {isLiveViewActive ? 'Membuka stream LiveView...' : 'LiveView sensor dalam mode siaga'}
                  </p>
                </div>
              )}
            </div>

            {/* Konfigurasi Orientasi & Mirror Kamera */}
            <div className="bg-slate-950/70 rounded-2xl p-3.5 border border-slate-800/90 mb-4 space-y-2.5">
              <div className="flex items-center gap-2 mb-1">
                <FlipHorizontal className="w-4 h-4 text-emerald-400" />
                <span className="text-[11px] font-bold text-slate-300 tracking-wider uppercase">
                  Konfigurasi Mirror Kamera
                </span>
              </div>

              {/* Mirror Preview (Viewfinder Countdown) */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Mirror Preview (Countdown)</div>
                  <div className="text-[10px] text-slate-400">Tampilan liveview saat berpose di layar</div>
                </div>
                <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleUpdateMirror('cameraPreview', 'mirror')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      config.cameraPreview !== 'original'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Mirror
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateMirror('cameraPreview', 'original')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      config.cameraPreview === 'original'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Original
                  </button>
                </div>
              </div>

              {/* Mirror Hasil Foto & Live Photo */}
              <div className="flex items-center justify-between pt-1.5 border-t border-slate-800/60">
                <div>
                  <div className="text-xs font-semibold text-slate-200">Mirror Hasil Foto & Video</div>
                  <div className="text-[10px] text-slate-400">File foto cetak, preview & klip Live Photo</div>
                </div>
                <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleUpdateMirror('cameraResult', 'mirror')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      config.cameraResult !== 'original'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Mirror
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateMirror('cameraResult', 'original')}
                    className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      config.cameraResult === 'original'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Original
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsLiveViewActive((prev) => !prev)}
            className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
              isLiveViewActive
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
            }`}
          >
            {isLiveViewActive ? (
              <>
                <EyeOff className="w-4 h-4" /> Matikan Preview LiveView
              </>
            ) : (
              <>
                <Eye className="w-4 h-4" /> Uji Preview LiveView (Viewfinder)
              </>
            )}
          </button>
        </div>

        {/* Database Session Inspector */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg">SQLite Session Store</h3>
                <p className="text-xs text-slate-400">kiosk.db (WAL Mode Active)</p>
              </div>
            </div>

            <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800/80 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Sesi Terakhir:</span>
                <span className="font-mono text-slate-200">{lastSession?.id || 'Belum ada transaksi'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status Cetak:</span>
                <span className="font-semibold text-emerald-400">{lastSession?.printStatus || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Remote Cloud URL:</span>
                <span className="font-mono text-slate-400 truncate max-w-[200px]">
                  {lastSession?.remoteUrl || 'Pending / Local'}
                </span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 mt-4">
            Basis data SQLite menjamin keutuhan data transaksi lokal bahkan jika daya booth terputus mendadak.
          </p>
        </div>

        {/* System & Power Controls */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center">
                <LogOut className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg">System Power Controls</h3>
                <p className="text-xs text-slate-400">Manajemen Siklus Hidup Aplikasi</p>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mb-6">
              Gunakan kontrol ini untuk memuat ulang aplikasi jika terjadi kendala hardware atau keluar ke desktop Windows
              untuk konfigurasi sistem.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleRestartKiosk}
              className="py-3.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition-all border border-slate-700"
            >
              <RotateCcw className="w-4 h-4" />
              Restart Kiosk
            </button>
            <button
              onClick={handleExitKiosk}
              className="py-3.5 px-4 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-rose-600/20"
            >
              <LogOut className="w-4 h-4" />
              Keluar ke Windows
            </button>
          </div>
        </div>

        {/* Gerbang Pembayaran & Bypass QRIS */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between md:col-span-2">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <CreditCard className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Gerbang Pembayaran & Bypass QRIS</h3>
                  <p className="text-xs text-slate-400">Midtrans Dynamic QRIS & Simulator Penyelesaian Transaksi</p>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  activeOrderId
                    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse'
                    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                }`}
              >
                {activeOrderId ? '⏱ MENUNGGU BAYAR' : '✓ STANDBY'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              {/* Active Order Box */}
              <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800/80 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Order ID Aktif:</span>
                  <span className="font-mono text-amber-300 font-semibold truncate max-w-[240px]">
                    {activeOrderId || 'Tidak ada transaksi aktif'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Status Gateway:</span>
                  <span className="font-semibold text-emerald-400">MIDTRANS QRIS SANDBOX / DEV</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Simulasi Backend:</span>
                  <span className="font-mono text-slate-400">POST /api/payments/simulate/:id</span>
                </div>
              </div>

              {/* Auto-Bypass Mode Box */}
              <div className="bg-slate-950/70 rounded-2xl p-4 border border-slate-800/90 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      isAutoBypassPayment ? 'bg-amber-400 animate-pulse shadow-lg shadow-amber-400/50' : 'bg-slate-600'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-200">Mode Auto-Bypass Pembayaran</div>
                    <div className="text-[11px] text-slate-400">
                      {isAutoBypassPayment
                        ? 'Otomatis sukses seketika saat masuk layar QRIS'
                        : 'Menunggu scan QRIS manual atau tombol bypass'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleToggleAutoBypassPayment}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-md flex items-center gap-1.5 ${
                    isAutoBypassPayment
                      ? 'bg-amber-600/30 border-amber-500/50 text-amber-300 hover:bg-amber-600/50'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isAutoBypassPayment ? 'bg-amber-400' : 'bg-slate-500'}`} />
                  {isAutoBypassPayment ? 'AKTIF' : 'NONAKTIF'}
                </button>
              </div>
            </div>

            {/* Manual Order Input if not currently awaiting */}
            {!activeOrderId && (
              <div className="mb-4">
                <label className="text-[11px] text-slate-400 block mb-1.5 font-medium">
                  Bypass Manual via Order ID (opsional):
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customOrderId}
                    onChange={(e) => setCustomOrderId(e.target.value)}
                    placeholder="Masukkan Order ID (contoh: TRX_BOOTH1_...)"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={() => handleBypassPayment(customOrderId)}
                    disabled={isBypassing || !customOrderId.trim()}
                    className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-black text-xs transition-all cursor-pointer"
                  >
                    Bypass ID Ini
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="pt-2">
            <button
              onClick={() => handleBypassPayment()}
              disabled={isBypassing || (!activeOrderId && !customOrderId.trim())}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
            >
              <Zap className="w-4 h-4 text-slate-950" />
              {isBypassing
                ? 'Memproses Bypass Pembayaran...'
                : activeOrderId
                ? `⚡ Bypass Pembayaran Aktif (${activeOrderId})`
                : '⚡ Bypass Pembayaran Sukses'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
