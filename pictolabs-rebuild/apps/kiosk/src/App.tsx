import { useState, useCallback } from 'react';
import WelcomeScreen from './screens/WelcomeScreen';
import FrameSelectScreen from './screens/FrameSelectScreen';
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
  | 'frame-select'
  | 'payment'
  | 'capture'
  | 'filter'
  | 'render'
  | 'print'
  | 'qr';

export interface SessionData {
  frameId?: string;
  frameName?: string;
  photos: string[];
  filter?: string;
  compositeUrl?: string;
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
      {screen === 'frame-select' && <FrameSelectScreen {...screenProps} />}
      {screen === 'payment' && <PaymentScreen {...screenProps} />}
      {screen === 'capture' && <CaptureScreen {...screenProps} />}
      {screen === 'filter' && <FilterScreen {...screenProps} />}
      {screen === 'render' && <RenderScreen {...screenProps} />}
      {screen === 'print' && <PrintScreen {...screenProps} />}
      {screen === 'qr' && <QRScreen {...screenProps} />}
    </div>
  );
}

export default function App() {
  return (
    <KioskConfigProvider>
      <KioskAppInner />
    </KioskConfigProvider>
  );
}
