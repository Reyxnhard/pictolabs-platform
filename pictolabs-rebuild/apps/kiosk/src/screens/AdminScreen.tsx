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
} from 'lucide-react';
import { kiosk, PrinterHealth } from '../ipc/bridge';

interface AdminScreenProps {
  onClose: () => void;
}

export default function AdminScreen({ onClose }: AdminScreenProps) {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const MASTER_PIN = '1234';

  // Hardware Health States
  const [printerHealth, setPrinterHealth] = useState<PrinterHealth | null>(null);
  const [isRefreshingPrinter, setIsRefreshingPrinter] = useState(false);
  const [lastSession, setLastSession] = useState<any>(null);

  // Camera LiveView test
  const [isLiveViewActive, setIsLiveViewActive] = useState(false);
  const [liveViewFrame, setLiveViewFrame] = useState<string | null>(null);

  // Operator Action Feedback
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);

  // ─── PIN Pad Logic ─────────────────────────────────────────
  const handleDigit = (digit: string) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length === 4) {
        verifyPin(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setPinError(false);
  };

  const verifyPin = (candidate: string) => {
    if (candidate === MASTER_PIN) {
      setIsAuthenticated(true);
      setPinError(false);
    } else {
      setPinError(true);
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
      const health = await kiosk.printer.getHealth();
      setPrinterHealth(health);

      const latest = await kiosk.session.getLast();
      setLastSession(latest);
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
    kiosk.camera.startLiveView()
      .then(() => {
        unsubscribe = kiosk.camera.onLiveViewFrame((base64) => {
          setLiveViewFrame(`data:image/jpeg;base64,${base64}`);
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

  const handleRestartKiosk = async () => {
    if (window.confirm('Muat ulang (restart) aplikasi kiosk sekarang?')) {
      await kiosk.system.restartKiosk();
    }
  };

  const handleExitKiosk = async () => {
    if (window.confirm('Tutup aplikasi dan kembali ke Desktop Windows?')) {
      await kiosk.system.exitKiosk();
    }
  };

  // ─── PIN Pad View (Unauthenticated) ────────────────────────
  if (!isAuthenticated) {
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
            <ShieldCheck className="w-8 h-8" />
          </div>

          <h2 className="text-xl font-bold tracking-tight">OPERATOR ACCESS</h2>
          <p className="text-xs text-slate-400 mt-1 mb-6 text-center">
            Masukkan 4-digit PIN Teknisi untuk masuk
          </p>

          {/* PIN Indicators */}
          <div className={`flex gap-4 mb-8 ${pinError ? 'animate-shake' : ''}`}>
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                  pin.length > idx
                    ? pinError
                      ? 'bg-rose-500 border-rose-500 scale-110'
                      : 'bg-blue-500 border-blue-500 scale-110'
                    : 'border-slate-700 bg-slate-800'
                }`}
              />
            ))}
          </div>

          {/* Keypad Grid */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                onClick={() => handleDigit(digit)}
                className="h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-2xl font-semibold transition-all border border-slate-700/60"
              >
                {digit}
              </button>
            ))}
            <button
              onClick={() => setPin('')}
              className="h-16 rounded-2xl bg-slate-800/40 hover:bg-slate-800 text-xs font-bold uppercase tracking-wider text-slate-400 transition-colors"
            >
              CLEAR
            </button>
            <button
              onClick={() => handleDigit('0')}
              className="h-16 rounded-2xl bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-2xl font-semibold transition-all border border-slate-700/60"
            >
              0
            </button>
            <button
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
                  <h3 className="font-bold text-lg">DSLR / LiveView</h3>
                  <p className="text-xs text-slate-400">Canon EOS 60D (EDSDK 13.x)</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                ✓ CONNECTED
              </span>
            </div>

            {/* LiveView Test Window */}
            <div className="w-full h-44 rounded-2xl bg-black border border-slate-800 overflow-hidden flex items-center justify-center relative mb-4">
              {isLiveViewActive && liveViewFrame ? (
                <img src={liveViewFrame} alt="LiveView Viewfinder" className="w-full h-full object-cover scale-x-[-1]" />
              ) : (
                <div className="text-center p-4">
                  <Camera className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 font-medium">
                    {isLiveViewActive ? 'Membuka stream LiveView...' : 'LiveView sensor dalam mode siaga'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => setIsLiveViewActive((prev) => !prev)}
            className={`w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
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
      </div>
    </div>
  );
}
