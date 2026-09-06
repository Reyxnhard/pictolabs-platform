import { useState, useEffect, useRef } from 'react';
import type { SessionData, KioskScreen } from '../App';
import { useKioskConfig } from '../context/KioskConfigContext';
import { kiosk, PrinterHealth } from '../ipc/bridge';
import { AlertTriangle, Wrench } from 'lucide-react';

export interface ScreenProps {
  session: SessionData;
  updateSession: (data: Partial<SessionData>) => void;
  navigate: (screen: KioskScreen) => void;
  resetSession: () => void;
  onOpenAdmin?: () => void;
}

export default function WelcomeScreen({ navigate, onOpenAdmin }: ScreenProps) {
  const { config } = useKioskConfig();

  // Printer Health Validation (Pre-Session Gate)
  const [printerHealth, setPrinterHealth] = useState<PrinterHealth | null>(null);

  // Hidden Gesture Detector: 5 taps within 3 seconds on the top-left area
  const tapTimestampsRef = useRef<number[]>([]);

  const themeColor = config.themeColor || '#3b82f6';
  const eventName = config.eventName || 'PICTOLABS SELF PHOTOBOOTH';
  const subText = config.subText || 'TOUCH SCREEN TO START';

  // Poll printer health every 5 seconds
  useEffect(() => {
    let isMounted = true;

    const checkHealth = async () => {
      try {
        const health = await kiosk.printer.getHealth();
        if (isMounted) {
          setPrinterHealth(health);
        }
      } catch (err) {
        console.warn('[WelcomeScreen] Failed to query printer health:', err);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Handle hidden operator gesture
  const handleSecretTap = (e: React.MouseEvent) => {
    e.stopPropagation(); // Do not trigger screen start
    const now = Date.now();
    const recent = tapTimestampsRef.current.filter((t) => now - t < 3000);
    recent.push(now);
    tapTimestampsRef.current = recent;

    if (recent.length >= 5) {
      tapTimestampsRef.current = [];
      if (onOpenAdmin) {
        onOpenAdmin();
      }
    }
  };

  const isPrinterReady = printerHealth === null || printerHealth.ready;

  const handleStart = () => {
    if (!isPrinterReady) {
      console.warn('[WelcomeScreen] Start blocked: Printer is not ready');
      return;
    }
    navigate('frame-select');
  };

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center relative select-none transition-colors duration-700 ease-out ${
        isPrinterReady ? 'cursor-pointer' : 'cursor-not-allowed'
      }`}
      style={{
        background: `linear-gradient(180deg, #ffffff 0%, ${themeColor}25 45%, ${themeColor} 100%)`,
      }}
      onClick={handleStart}
    >
      {/* Hidden Operator Gesture Hotspot (Top-Left 90x90px) */}
      <div
        onClick={handleSecretTap}
        className="absolute top-0 left-0 w-24 h-24 z-40 cursor-default opacity-0 hover:opacity-10 transition-opacity flex items-center justify-center text-xs text-slate-500 font-mono"
        title="Admin Hotspot"
      >
        [ADM]
      </div>

      {/* Halftone pattern overlay */}
      <div
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
          backgroundSize: '8px 8px',
        }}
      />

      {/* Printer Health Maintenance Banner (Hardware Gate) */}
      {!isPrinterReady && (
        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-30 max-w-xl w-full px-6 animate-slide-up pointer-events-auto">
          <div className="bg-rose-900/90 text-rose-100 border-2 border-rose-500 p-4 rounded-3xl shadow-2xl backdrop-blur-md flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-800 text-rose-300 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-6 h-6 animate-pulse text-amber-300" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-sm text-white tracking-wide flex items-center gap-2">
                PEMELIHARAAN PRINTER
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-700">
                  {printerHealth?.code || 'MAINTENANCE'}
                </span>
              </h4>
              <p className="text-xs text-rose-200 mt-0.5">
                {printerHealth?.message || 'Printer sedang kehabisan kertas atau penutup terbuka. Silakan hubungi staf.'}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenAdmin) onOpenAdmin();
              }}
              className="px-3 py-2 rounded-xl bg-rose-800 hover:bg-rose-700 text-xs font-bold text-white flex items-center gap-1 border border-rose-600 transition-colors"
            >
              <Wrench className="w-3.5 h-3.5" />
              Staf
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10 text-center animate-slide-up flex flex-col items-center px-6">
        {/* Visual Box with Event Name */}
        <div
          className="w-[640px] h-[380px] bg-white/70 backdrop-blur-md rounded-3xl border-4 border-white shadow-2xl flex flex-col items-center justify-center mb-10 animate-float transition-all duration-500 px-8"
          style={{
            boxShadow: `0 25px 50px -12px ${themeColor}40`,
          }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4 text-white shadow-lg transition-colors duration-500"
            style={{ backgroundColor: themeColor }}
          >
            📸
          </div>
          <h1
            className="font-display font-black text-4xl sm:text-5xl tracking-tight transition-colors duration-500"
            style={{ color: themeColor }}
          >
            {eventName}
          </h1>
          <p className="text-slate-500 font-semibold mt-3 text-lg tracking-wide uppercase">
            Quality 300 DPI Memories
          </p>
        </div>

        {/* Tap prompt */}
        <div className="animate-fade-in" style={{ animationDelay: '0.5s' }}>
          <div
            className={`inline-flex items-center gap-4 px-10 py-5 rounded-full shadow-2xl font-bold text-2xl tracking-wide uppercase group transition-all duration-300 transform ${
              isPrinterReady
                ? 'bg-white hover:scale-105 active:scale-95'
                : 'bg-slate-200 opacity-60'
            }`}
            style={{
              color: isPrinterReady ? themeColor : '#64748b',
              boxShadow: isPrinterReady ? `0 20px 35px -10px ${themeColor}50` : 'none',
            }}
          >
            <span className="transition-transform font-black">
              {isPrinterReady ? subText : 'PRINTER SEDANG PENGECEKAN...'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
