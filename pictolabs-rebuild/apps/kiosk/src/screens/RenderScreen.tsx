import { useEffect, useState, useRef } from 'react';
import type { ScreenProps } from './WelcomeScreen';
import { kiosk } from '../ipc/bridge';
import { useKioskConfig } from '../context/KioskConfigContext';

export default function RenderScreen({ session, updateSession, navigate }: ScreenProps) {
  const [progress, setProgress] = useState(0);
  const [stageText, setStageText] = useState('Menginisiasi render engine 300 DPI...');
  const [error, setError] = useState<string | null>(null);
  const hasRendered = useRef(false);
  const { config } = useKioskConfig();

  const themeColor = config.themeColor || '#3b82f6';

  useEffect(() => {
    // Dynamic progress bar and pipeline steps
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = Math.min(p + 4, 90);
        if (next < 30) {
          setStageText('Memproses foto resolusi tinggi...');
        } else if (next < 60) {
          setStageText('Menyusun frame layout 300 DPI (Sharp C++ Engine)...');
        } else {
          setStageText('Menerapkan color grading & LUT filter...');
        }
        return next;
      });
    }, 120);

    async function processComposite() {
      if (hasRendered.current) return;
      hasRendered.current = true;

      try {
        const frameId = session.frameDesignId || session.frameId || '2R';
        const filter = session.filter || 'none';
        
        const cleanPhotos = session.photos.map((p: string) => p.replace('file://', ''));

        if (session.sessionId) {
          kiosk.recovery?.checkpoint?.(session.sessionId, 'RENDER_PENDING', cleanPhotos.length, {
            filter,
            frameId,
            photos: cleanPhotos,
          }).catch(() => {});
        }

        const result = await kiosk.render.composite(
          cleanPhotos,
          frameId,
          filter
        );

        const dataUrl = typeof result === 'string' ? result : result.dataUrl;
        const filePath = typeof result === 'string' ? '' : result.filePath;
        const compositeUrl = dataUrl.startsWith('data:') 
          ? dataUrl 
          : `file://${dataUrl}`;

        // Generate animated looping GIF from poses
        let gifPath: string | undefined;
        let gifUrl: string | undefined;
        try {
          if (typeof kiosk?.livePhoto?.generateGif === 'function') {
            const gifRes = await kiosk.livePhoto.generateGif(session.sessionId || 'session', cleanPhotos);
            if (gifRes && gifRes.success) {
              gifPath = gifRes.gifPath;
              gifUrl = gifRes.mp4Path || gifRes.gifPath;
              console.log('[RenderScreen] ✓ GIF loop generated successfully:', gifPath);
            }
          }
        } catch (gErr) {
          console.warn('[RenderScreen] GIF generation warning:', gErr);
        }

        // Save session directly to SQLite (WAL Mode) via SyncEngine
        let createdSessionId: string | undefined;
        try {
          const sessionRecord = await kiosk.session.create({
            id: session.sessionId,
            frameId,
            filter,
            photos: cleanPhotos,
            compositePath: filePath,
            liveVideoPath: session.liveVideoPath,
            liveVideoPaths: session.liveVideoPaths,
            gifPath,
            printStatus: 'pending',
          });
          createdSessionId = sessionRecord?.id || session.sessionId;
          console.log('[RenderScreen] ✓ Session saved in SQLite & upload queued:', createdSessionId);
        } catch (sErr) {
          console.warn('[RenderScreen] SQLite session creation warning:', sErr);
        }

        const effectiveSessionId = createdSessionId || session.sessionId;
        if (effectiveSessionId) {
          kiosk.recovery?.checkpoint?.(effectiveSessionId, 'READY_FOR_PRINT', cleanPhotos.length, {
            compositePath: filePath,
            compositeUrl,
            gifPath,
            gifUrl,
          }).catch(() => {});
        }

        updateSession({ 
          compositeUrl, 
          compositePath: filePath,
          gifPath,
          gifUrl,
          sessionId: createdSessionId,
        });
        
        setStageText('Selesai! Membuka halaman unduh dan mencetak foto...');
        setProgress(100);
        clearInterval(interval);
        setTimeout(() => navigate('qr'), 600);
      } catch (err) {
        console.error('Render error:', err);
        setError('Gagal memproses foto. Silakan hubungi operator.');
        clearInterval(interval);
      }
    }

    processComposite();

    return () => clearInterval(interval);
  }, [navigate, session.frameId, session.filter, session.photos, updateSession]);

  return (
    <div 
      className="w-full h-full flex flex-col items-center justify-center select-none relative transition-colors duration-700"
      style={{
        background: `linear-gradient(180deg, #ffffff 0%, ${themeColor}20 50%, ${themeColor} 100%)`,
      }}
    >
      <div 
        className="bg-white/90 backdrop-blur-2xl p-12 rounded-[36px] shadow-2xl border-4 border-white max-w-lg w-full text-center animate-slide-up flex flex-col items-center"
        style={{
          boxShadow: `0 30px 60px -15px ${themeColor}40`
        }}
      >
        {/* Animated Gear Icon */}
        <div 
          className="w-24 h-24 rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-xl animate-spin"
          style={{ 
            backgroundColor: `${themeColor}20`,
            animationDuration: '8s'
          }}
        >
          ⚙️
        </div>

        <h2 className="font-display text-3xl font-black text-slate-800 mb-2">
          {error ? 'GAGAL MEMPROSES' : 'MENYUSUN FOTOMU...'}
        </h2>
        <p className="text-slate-500 text-sm font-semibold mb-8 min-h-6">
          {error || stageText}
        </p>

        {/* Progress Bar Container */}
        <div className="w-full h-5 bg-slate-100 rounded-full overflow-hidden mb-3 border border-slate-200/80 p-0.5">
          <div
            className="h-full rounded-full transition-all duration-150 ease-out shadow-md"
            style={{ 
              width: `${progress}%`,
              backgroundColor: themeColor
            }}
          />
        </div>

        <div className="flex justify-between w-full text-xs font-bold text-slate-400 font-mono px-1">
          <span>HIGH-RES COMPOSITING</span>
          <span style={{ color: themeColor }}>{progress}%</span>
        </div>
      </div>
    </div>
  );
}
