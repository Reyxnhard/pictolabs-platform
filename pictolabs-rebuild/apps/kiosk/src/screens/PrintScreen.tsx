import { useEffect, useState, useRef } from 'react';
import type { ScreenProps } from './WelcomeScreen';
import { kiosk } from '../ipc/bridge';
import { useKioskConfig } from '../context/KioskConfigContext';
import confetti from 'canvas-confetti';

export default function PrintScreen({ session, navigate }: ScreenProps) {
  const [isPrinting, setIsPrinting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasPrinted = useRef(false);
  const { config } = useKioskConfig();

  const themeColor = config.themeColor || '#3b82f6';

  useEffect(() => {
    async function executePrint() {
      if (hasPrinted.current) return;
      hasPrinted.current = true;

      try {
        if (!session.compositeUrl) {
          throw new Error('No composite image found to print');
        }

        const cleanPath = session.compositeUrl.replace('file://', '');
        
        // Ensure UI stays on "Printing" for at least 3.5s for realistic spooler UX
        const minPrintTime = new Promise((r) => setTimeout(r, 3500));
        const printTask = kiosk.printer.print(cleanPath, 1);

        const [, result] = await Promise.all([minPrintTime, printTask]);

        if (!result.success) {
          console.warn('Printer warning/error:', result.error);
        }

        // Update session print status in SQLite
        if (session.sessionId) {
          kiosk.session.update(session.sessionId, {
            printStatus: result.success ? 'printed' : 'failed',
          }).catch((e) => console.warn('[PrintScreen] Failed to update session printStatus:', e));
        }

        // Trigger celebratory confetti burst!
        try {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 }
          });
        } catch {}

        setIsPrinting(false);
        setTimeout(() => navigate('qr'), 1400);

      } catch (err) {
        console.error('Print process failed:', err);
        if (session.sessionId) {
          kiosk.session.update(session.sessionId, { printStatus: 'failed' })
            .catch((e) => console.warn('[PrintScreen] Failed to set session failed:', e));
        }
        setError('Gagal mencetak foto. Silakan hubungi petugas.');
        setIsPrinting(false);
        setTimeout(() => navigate('qr'), 3000);
      }
    }

    executePrint();
  }, [navigate, session.compositeUrl, session.sessionId]);

  return (
    <div 
      className="w-full h-full flex flex-col items-center justify-center select-none relative transition-colors duration-700"
      style={{
        background: `linear-gradient(180deg, #ffffff 0%, ${themeColor}20 50%, ${themeColor} 100%)`,
      }}
    >
      <div 
        className="bg-white/90 backdrop-blur-2xl p-12 rounded-[36px] shadow-2xl border-4 border-white max-w-md w-full text-center animate-slide-up flex flex-col items-center"
        style={{
          boxShadow: `0 30px 60px -15px ${themeColor}40`
        }}
      >
        <div 
          className="w-24 h-24 rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-xl transition-all"
          style={{ backgroundColor: `${themeColor}20` }}
        >
          🖨️
        </div>

        <h2 className="font-display text-2xl font-black text-slate-800 mb-2">
          {error ? 'GAGAL MENCETAK' : isPrinting ? 'SEDANG MENCETAK FOTO...' : 'CETAK SELESAI! 🎉'}
        </h2>
        <p className={`text-sm font-semibold ${error ? 'text-red-500' : 'text-slate-500'}`}>
          {error
            ? error
            : isPrinting
            ? 'Silakan tunggu, foto 300 DPI sedang dicetak ke kertas thermal glossy...'
            : 'Silakan ambil foto di tray printer bagian bawah.'}
        </p>

        {isPrinting && (
          <div className="flex gap-2.5 mt-8">
            <div 
              className="w-3.5 h-3.5 rounded-full animate-bounce shadow" 
              style={{ backgroundColor: themeColor, animationDelay: '0ms' }} 
            />
            <div 
              className="w-3.5 h-3.5 rounded-full animate-bounce shadow" 
              style={{ backgroundColor: themeColor, animationDelay: '150ms' }} 
            />
            <div 
              className="w-3.5 h-3.5 rounded-full animate-bounce shadow" 
              style={{ backgroundColor: themeColor, animationDelay: '300ms' }} 
            />
          </div>
        )}
      </div>
    </div>
  );
}
