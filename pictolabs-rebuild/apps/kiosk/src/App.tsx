import { useState, useCallback, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import WelcomeScreen from './screens/WelcomeScreen';
import ProductSelectScreen from './screens/ProductSelectScreen';
import FrameDesignScreen from './screens/FrameDesignScreen';
import PaymentScreen from './screens/PaymentScreen';
import CaptureScreen from './screens/CaptureScreen';
import FilterScreen from './screens/FilterScreen';
import RenderScreen from './screens/RenderScreen';
import PrintScreen from './screens/PrintScreen';
import QRScreen from './screens/QRScreen';
import AdminScreen from './screens/AdminScreen';
import ActivationScreen from './screens/ActivationScreen';
import { KioskConfigProvider, useKioskConfig } from './context/KioskConfigContext';
import { Sparkles, RefreshCw, Ticket, ArrowRight, XCircle, ShieldCheck } from 'lucide-react';
import { kiosk, RecoverableSessionDTO, RescueVoucher } from './ipc/bridge';
import QRCode from 'qrcode';

export type KioskScreen =
  | 'welcome'
  | 'product-select'
  | 'frame-select'
  | 'payment'
  | 'frame-design'
  | 'capture'
  | 'filter'
  | 'render'
  | 'print'
  | 'qr'
  | 'activation';

export interface SessionData {
  sessionId?: string;
  productId?: string;
  productName?: string;
  frameId?: string;
  frameName?: string;
  frameDesignId?: string;
  frameDesignName?: string;
  frameDesignTheme?: string;
  frameDesignBorderColor?: string;
  photos: string[];
  filter?: string;
  compositeUrl?: string;
  compositePath?: string;
  liveVideoPath?: string;
  liveVideoPaths?: string[];
  liveVideoUrl?: string;
  liveVideoUrls?: string[];
  gifUrl?: string;
  gifPath?: string;
}

function KioskAppInner() {
  const [screen, setScreen] = useState<KioskScreen>('welcome');
  const [session, setSession] = useState<SessionData>({ photos: [] });
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const { showLiveBanner, bannerText } = useKioskConfig();

  const navigate = useCallback((next: KioskScreen) => {
    setScreen(next);
  }, []);

  const resetSession = useCallback(() => {
    setSession({ photos: [] });
    setScreen('welcome');
  }, []);

  const updateSession = useCallback((data: Partial<SessionData>) => {
    setSession((prev) => ({ ...prev, ...data }));
  }, []);

  const openAdmin = useCallback(() => {
    setIsAdminOpen(true);
  }, []);

  const closeAdmin = useCallback(() => {
    setIsAdminOpen(false);
  }, []);

  const [recoverableSession, setRecoverableSession] = useState<RecoverableSessionDTO | null>(null);
  const [recoveryCountdown, setRecoveryCountdown] = useState<number>(60);
  const [rescueVoucher, setRescueVoucher] = useState<RescueVoucher | null>(null);
  const [voucherQrUrl, setVoucherQrUrl] = useState<string | null>(null);

  // Check for crash recovery on mount
  useEffect(() => {
    kiosk.recovery?.checkRecoverable?.().then((rec) => {
      if (rec && rec.status === 'ACTIVE') {
        console.log('[App] 🛡 Active recoverable session detected:', rec.sessionId, rec.stage);
        setRecoverableSession(rec);
        setRecoveryCountdown(60);
      }
    }).catch((err) => {
      console.warn('[App] Recovery check warning:', err);
    });
  }, []);

  // Check booth pairing & provisioning status on mount (Phase 3.3)
  useEffect(() => {
    kiosk.identity?.getStatus?.().then((status) => {
      if (status && !status.isPaired) {
        console.log('[App] 🔒 Kiosk unit is unpaired. Navigating to ActivationScreen.');
        setScreen('activation');
      }
    }).catch((err) => {
      console.warn('[App] Identity status check warning:', err);
    });
  }, []);

  const handleResumeSession = useCallback(async (rec: RecoverableSessionDTO) => {
    try {
      await kiosk.recovery?.resume?.(rec.sessionId);
      const p = rec.payload;
      updateSession({
        sessionId: rec.sessionId,
        productId: p.productId,
        productName: p.productName,
        frameId: p.frameId,
        frameName: p.frameName,
        frameDesignId: p.frameDesignId,
        frameDesignName: p.frameDesignName,
        frameDesignTheme: p.frameDesignTheme,
        frameDesignBorderColor: p.frameDesignBorderColor,
        photos: p.photos || [],
        filter: p.filter,
        compositePath: p.compositePath,
        compositeUrl: p.compositeUrl,
        liveVideoPaths: p.liveVideoPaths,
        liveVideoPath: p.liveVideoPath,
        gifPath: p.gifPath,
        gifUrl: p.gifUrl,
      });
      setRecoverableSession(null);
      navigate(rec.targetScreen as KioskScreen);
    } catch (err) {
      console.error('[App] Error resuming session:', err);
      setRecoverableSession(null);
    }
  }, [updateSession, navigate]);

  // 60-second recovery countdown
  useEffect(() => {
    if (!recoverableSession || rescueVoucher) return;
    const timer = setInterval(() => {
      setRecoveryCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          handleResumeSession(recoverableSession);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [recoverableSession, rescueVoucher, handleResumeSession]);

  const handleDiscardOrVoucher = async () => {
    if (!recoverableSession) return;
    const sid = recoverableSession.sessionId;
    try {
      const voucher = await kiosk.recovery?.claimVoucher?.(sid, 'CUSTOMER_REQUESTED_VOUCHER');
      if (voucher && voucher.success) {
        const qrUrl = await QRCode.toDataURL(voucher.qrPayload, {
          width: 320,
          margin: 1,
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        setVoucherQrUrl(qrUrl);
        setRescueVoucher(voucher);
      } else {
        await kiosk.recovery?.discard?.(sid);
        setRecoverableSession(null);
      }
    } catch {
      await kiosk.recovery?.discard?.(sid);
      setRecoverableSession(null);
    }
  };

  // ─── Phase 3.2E Autonomous Watchdog Integration ──────────
  const [isDiskLockedOut, setIsDiskLockedOut] = useState(false);

  useEffect(() => {
    // Notify watchdog of screen transitions
    kiosk.watchdog?.setScreen?.(screen, session.sessionId || null);

    // Activity pulse on user touch/clicks/keys
    let lastPulse = 0;
    const handleActivityPulse = () => {
      const now = Date.now();
      if (now - lastPulse > 5000) {
        lastPulse = now;
        kiosk.watchdog?.pulseActivity?.(screen, session.sessionId || undefined);
      }
    };

    window.addEventListener('pointerdown', handleActivityPulse, { passive: true });
    window.addEventListener('keydown', handleActivityPulse, { passive: true });

    // Listen for force-welcome reset from Session Watchdog
    const unsubWelcome = kiosk.watchdog?.onForceWelcome?.(() => {
      console.warn('[App] Session Watchdog reset kiosk to WelcomeScreen due to inactivity');
      navigate('welcome');
      resetSession();
    });

    // Listen for disk lockout from Disk Watchdog
    const unsubLockout = kiosk.watchdog?.onDiskLockout?.((isLocked) => {
      setIsDiskLockedOut(isLocked);
    });

    return () => {
      window.removeEventListener('pointerdown', handleActivityPulse);
      window.removeEventListener('keydown', handleActivityPulse);
      if (unsubWelcome) unsubWelcome();
      if (unsubLockout) unsubLockout();
    };
  }, [screen, session.sessionId, navigate, resetSession]);

  const screenProps = {
    session,
    updateSession,
    navigate,
    resetSession,
    onOpenAdmin: openAdmin,
  };

  return (
    <div className="w-full h-full relative overflow-hidden select-none">
      {/* Disk Full Emergency Maintenance Banner */}
      {isDiskLockedOut && (
        <div className="absolute top-0 inset-x-0 z-50 bg-rose-600 text-white text-center py-2 text-xs font-bold tracking-wide shadow-md flex items-center justify-center gap-2">
          <span>⚠️ MEMORI PENUH — KIOSK DALAM MODE PEMELIHARAAN SISTEM</span>
        </div>
      )}
      {/* Real-time Cloud Push Notification Toast */}
      {showLiveBanner && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 animate-bounce pointer-events-none">
          <div className="flex items-center gap-3 px-6 py-3.5 rounded-full bg-slate-900/90 text-white shadow-2xl border-2 border-emerald-400 backdrop-blur-md">
            <Sparkles className="w-5 h-5 text-emerald-400 animate-spin" />
            <span className="font-bold text-sm tracking-wide text-emerald-200">
              {bannerText}
            </span>
          </div>
        </div>
      )}

      {/* Hidden Operator Admin Panel Modal */}
      {isAdminOpen && <AdminScreen onClose={closeAdmin} />}

      {/* ─── Phase 3.2D Crash Recovery Prompt Modal ─── */}
      {recoverableSession && !rescueVoucher && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-slate-900 border-2 border-emerald-500/80 rounded-3xl p-8 max-w-lg w-full text-white shadow-2xl shadow-emerald-950/50 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center mb-6 animate-pulse">
              <ShieldCheck className="w-10 h-10 text-emerald-400" />
            </div>

            <h2 className="text-3xl font-black tracking-wide text-emerald-300 mb-2">
              Sesi Anda Dipulihkan!
            </h2>
            <p className="text-slate-300 text-sm mb-6 leading-relaxed">
              Booth baru saja menyala kembali. Kami menemukan pembayaran dan progres foto Anda yang belum selesai.
            </p>

            <div className="w-full bg-slate-800/80 rounded-2xl p-4 mb-6 border border-slate-700 text-left text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">ID Sesi:</span>
                <span className="font-mono text-emerald-300 font-bold">{recoverableSession.sessionId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Produk:</span>
                <span className="text-white font-semibold">{recoverableSession.payload.productName || 'Photostrip'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tahap Terakhir:</span>
                <span className="font-mono text-amber-300">{recoverableSession.stage} (Langkah {recoverableSession.lastCompletedStep})</span>
              </div>
              {Array.isArray(recoverableSession.payload.photos) && recoverableSession.payload.photos.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Foto Tersimpan:</span>
                  <span className="text-emerald-400 font-bold">{recoverableSession.payload.photos.length} Foto Siap Digunakan</span>
                </div>
              )}
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-amber-300 font-bold mb-6">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Melanjutkan otomatis dalam {recoveryCountdown} detik...
            </div>

            <div className="w-full space-y-3">
              <button
                onClick={() => handleResumeSession(recoverableSession)}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 font-black text-lg tracking-wide shadow-lg shadow-emerald-500/30 active:scale-[0.98] transition-all flex items-center justify-center gap-3 cursor-pointer"
              >
                <span>Lanjutkan Sesi Foto</span>
                <ArrowRight className="w-6 h-6" />
              </button>

              <button
                onClick={handleDiscardOrVoucher}
                className="w-full py-3 px-6 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-sm font-semibold border border-slate-700 flex items-center justify-center gap-2 active:scale-[0.98] transition-all cursor-pointer"
              >
                <Ticket className="w-4 h-4 text-amber-400" />
                <span>Batalkan & Dapatkan Voucher Pengganti</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Phase 3.2D Rescue Voucher Modal ─── */}
      {rescueVoucher && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-6 animate-fadeIn">
          <div className="bg-slate-900 border-2 border-amber-500/80 rounded-3xl p-8 max-w-md w-full text-white shadow-2xl shadow-amber-950/50 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center mb-4">
              <Ticket className="w-8 h-8 text-amber-400" />
            </div>

            <h2 className="text-2xl font-black tracking-wide text-amber-300 mb-1">
              Rescue Voucher Diterbitkan!
            </h2>
            <p className="text-slate-300 text-xs mb-4">
              Foto atau simpan kode ini untuk sesi gratis di seluruh booth Pictolabs (berlaku 30 hari).
            </p>

            {voucherQrUrl && (
              <div className="bg-white p-3 rounded-2xl shadow-xl mb-4 border-2 border-slate-200">
                <img src={voucherQrUrl} alt="Rescue Voucher QR" className="w-48 h-48 rounded-lg" />
              </div>
            )}

            <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 mb-6 font-mono text-emerald-300 font-bold text-lg tracking-widest">
              {rescueVoucher.voucherCode}
            </div>

            <button
              onClick={() => {
                setRescueVoucher(null);
                setRecoverableSession(null);
                resetSession();
              }}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 font-bold text-slate-950 shadow-lg active:scale-[0.98] transition-all cursor-pointer"
            >
              Selesai & Mulai Sesi Baru
            </button>
          </div>
        </div>
      )}

      {screen === 'welcome' && <WelcomeScreen {...screenProps} />}
      {(screen === 'product-select' || screen === 'frame-select') && (
        <ProductSelectScreen {...screenProps} />
      )}
      {screen === 'payment' && <PaymentScreen {...screenProps} />}
      {screen === 'frame-design' && <FrameDesignScreen {...screenProps} />}
      {screen === 'capture' && <CaptureScreen {...screenProps} />}
      {screen === 'filter' && <FilterScreen {...screenProps} />}
      {screen === 'render' && <RenderScreen {...screenProps} />}
      {(screen === 'print' || screen === 'qr') && <QRScreen {...screenProps} />}
      {screen === 'activation' && (
        <ActivationScreen
          onActivated={(_identity) => {
            console.log('[App] Booth activated. Moving to welcome screen.');
            navigate('welcome');
          }}
        />
      )}
    </div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Kiosk ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900 text-white p-8 select-none">
          <div className="max-w-md w-full bg-slate-800/90 backdrop-blur-xl p-8 rounded-3xl border border-rose-500/30 shadow-2xl text-center flex flex-col items-center">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-3xl mb-4">
              ⚠️
            </div>
            <h2 className="text-xl font-bold font-display mb-2 text-rose-200">Terjadi Kendala Tampilan</h2>
            <p className="text-slate-400 text-xs mb-6 max-h-24 overflow-auto font-mono bg-slate-950/60 p-3 rounded-xl border border-white/5">
              {this.state.error?.message || 'Gagal memuat komponen halaman.'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-6 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 active:scale-95 text-white font-bold text-sm cursor-pointer transition-all shadow-lg shadow-primary-600/30"
            >
              Muat Ulang Kiosk
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <KioskConfigProvider>
        <KioskAppInner />
      </KioskConfigProvider>
    </ErrorBoundary>
  );
}
