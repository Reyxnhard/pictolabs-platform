import { useState, useEffect, useRef } from 'react';
import type { SessionData, KioskScreen } from '../App';
import { useKioskConfig } from '../context/KioskConfigContext';
import { kiosk, PrinterHealth } from '../ipc/bridge';
import { AlertTriangle, Wrench, Shield } from 'lucide-react';

export interface ScreenProps {
  session: SessionData;
  updateSession: (data: Partial<SessionData>) => void;
  navigate: (screen: KioskScreen) => void;
  resetSession: () => void;
  onOpenAdmin?: () => void;
}

export default function WelcomeScreen({ navigate, onOpenAdmin }: ScreenProps) {
  const { config } = useKioskConfig();

  // Printer Health & Paper Status Validation (Pre-Session Gate)
  const [printerHealth, setPrinterHealth] = useState<PrinterHealth | null>(null);
  const [paperStatus, setPaperStatus] = useState<any | null>(null);
  const [hardwareStatus, setHardwareStatus] = useState<any | null>(null);

  const themeColor = config.themeColor || '#3b82f6';
  const eventName = config.eventName || 'PICTOLABS SELF PHOTOBOOTH';
  const subText = config.subText || 'TOUCH SCREEN TO START';

  // Poll printer health, hardware, and paper roll every 5 seconds
  useEffect(() => {
    let isMounted = true;

    const checkHealth = async () => {
      try {
        const [health, paper, hw] = await Promise.all([
          kiosk.printer.getHealth(),
          kiosk.printer.getPaperStatus ? kiosk.printer.getPaperStatus() : Promise.resolve(null),
          kiosk.printer.getHardwareStatus ? kiosk.printer.getHardwareStatus() : Promise.resolve(null),
        ]);

        if (isMounted) {
          setPrinterHealth(health);
          if (paper) setPaperStatus(paper);
          if (hw) setHardwareStatus(hw);
        }
      } catch (err) {
        console.warn('[WelcomeScreen] Failed to query printer health/paper:', err);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Printer Bypass state (enabled by default so kiosk can be tested without physical printer)
  const [bypassPrinter, setBypassPrinter] = useState(() => {
    return localStorage.getItem('pictolabs-bypass-printer') !== 'false';
  });

  const isPaperDepleted = Boolean(paperStatus && paperStatus.isLockedOut);
  const isHardwareError = Boolean(hardwareStatus && !hardwareStatus.ready);
  const isHealthError = Boolean(printerHealth && !printerHealth.ready);

  const isPrinterReady = bypassPrinter || (!isPaperDepleted && !isHardwareError && !isHealthError);

  const handleStart = () => {
    if (!isPrinterReady) {
      console.warn('[WelcomeScreen] Start blocked: Printer is not ready or paper roll depleted');
      return;
    }
    navigate('product-select');
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
      {/* Visible but Discreet Operator / Staff Access Entry Point */}
      <button
        type="button"
        id="btn-kiosk-admin-entry"
        onClick={(e) => {
          e.stopPropagation();
          if (onOpenAdmin) onOpenAdmin();
        }}
        className="absolute top-6 right-6 z-30 px-3.5 py-1.5 rounded-full bg-slate-900/35 hover:bg-slate-900/80 text-slate-500 hover:text-white border border-slate-700/30 hover:border-slate-500/60 backdrop-blur-md text-xs font-medium flex items-center gap-1.5 transition-all opacity-40 hover:opacity-100 cursor-pointer shadow-sm group"
        title="Akses Operator / Staff"
        aria-label="Staff Access"
      >
        <Shield className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-400 transition-colors" />
        <span className="tracking-wide text-[11px] font-mono">Staff</span>
      </button>

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
                {isPaperDepleted ? 'KERTAS FOTO HABIS' : 'PEMELIHARAAN PRINTER'}
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-700">
                  {isPaperDepleted ? `SISA ${paperStatus?.remaining ?? 0} SHEET` : (hardwareStatus?.errorCode || printerHealth?.code || 'MAINTENANCE')}
                </span>
              </h4>
              <p className="text-xs text-rose-200 mt-0.5">
                {isPaperDepleted
                  ? `Bilik foto sedang pengisian ulang kertas (Sisa roll: ${paperStatus?.remaining ?? 0} lembar). Silakan hubungi staf/operator.`
                  : (hardwareStatus?.message || printerHealth?.message || 'Printer sedang offline atau membutuhkan intervensi. Silakan hubungi staf.')}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setBypassPrinter(true);
                localStorage.setItem('pictolabs-bypass-printer', 'true');
              }}
              className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white flex items-center gap-1 border border-amber-400 transition-colors shadow"
            >
              ⚡ Bypass
            </button>
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
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl mb-4 text-white shadow-lg transition-colors duration-500 select-none"
            style={{ backgroundColor: themeColor }}
            title="Pictolabs"
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
