import { useState, useCallback, Component, ErrorInfo, ReactNode } from 'react';
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
import { KioskConfigProvider, useKioskConfig } from './context/KioskConfigContext';
import { Sparkles } from 'lucide-react';

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
  | 'qr';

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

  const screenProps = {
    session,
    updateSession,
    navigate,
    resetSession,
    onOpenAdmin: openAdmin,
  };

  return (
    <div className="w-full h-full relative overflow-hidden select-none">
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
