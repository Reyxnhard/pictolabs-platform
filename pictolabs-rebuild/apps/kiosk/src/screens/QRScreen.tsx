import { useState, useEffect } from 'react';
import type { ScreenProps } from './WelcomeScreen';
import { useKioskConfig } from '../context/KioskConfigContext';
import { kiosk } from '../ipc/bridge';
import QRCode from 'qrcode';
import { CloudCheck, Download, Sparkles } from 'lucide-react';

export default function QRScreen({ navigate, session }: ScreenProps) {
  const [countdown, setCountdown] = useState(30);
  const [qrSrc, setQrSrc] = useState<string>('');
  const [activeUrl, setActiveUrl] = useState<string>('');
  const [isUploaded, setIsUploaded] = useState(false);
  const { config } = useKioskConfig();

  const themeColor = config.themeColor || '#3b82f6';
  const apiBase = config.apiBaseUrl || 'http://localhost:4000';
  const defaultDownloadId = session.frameId ? `PICTO-${Date.now().toString(36).toUpperCase()}` : 'PICTO-DEMO-88';
  const [sessionId, setSessionId] = useState(defaultDownloadId);

  // Poll latest session from SQLite to retrieve actual live remote_url
  useEffect(() => {
    let isMounted = true;

    const checkUploadStatus = async () => {
      try {
        const last = await kiosk.session.getLast();
        if (last && isMounted) {
          setSessionId(last.id);
          if (last.remoteUrl) {
            setActiveUrl(last.remoteUrl);
            setIsUploaded(true);
            return;
          }
        }
        // Fallback target URL
        const fallback = `${apiBase}/uploads/composite_${last?.id || defaultDownloadId}.jpg`;
        if (!activeUrl && isMounted) {
          setActiveUrl(fallback);
        }
      } catch (err) {
        console.warn('[QRScreen] Failed to fetch session info:', err);
      }
    };

    checkUploadStatus();
    const interval = setInterval(checkUploadStatus, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [apiBase, defaultDownloadId, activeUrl]);

  // Generate QR code whenever activeUrl updates
  useEffect(() => {
    const targetUrl = activeUrl || `https://pictolabs.id/d/${sessionId}`;
    QRCode.toDataURL(targetUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then(setQrSrc)
      .catch(console.error);
  }, [activeUrl, sessionId]);

  // Auto return countdown
  useEffect(() => {
    if (countdown <= 0) {
      navigate('welcome');
      return;
    }
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown, navigate]);

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center select-none relative transition-colors duration-700"
      style={{
        background: `linear-gradient(180deg, #ffffff 0%, ${themeColor}20 50%, ${themeColor} 100%)`,
      }}
    >
      <div
        className="bg-white/95 backdrop-blur-2xl p-10 rounded-[40px] shadow-2xl border-4 border-white max-w-lg w-full text-center animate-slide-up flex flex-col items-center"
        style={{
          boxShadow: `0 30px 60px -15px ${themeColor}40`,
        }}
      >
        {/* Countdown & Status pills */}
        <div className="flex items-center gap-2 mb-4">
          <div className="px-4 py-1.5 rounded-full bg-slate-100 text-slate-500 font-black text-xs font-mono">
            KEMBALI KE AWAL: {countdown}s
          </div>
          <div
            className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${
              isUploaded
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                : 'bg-blue-100 text-blue-700 border border-blue-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {isUploaded ? 'Siap Diunduh' : 'Menyinkronkan...'}
          </div>
        </div>

        <h2 className="font-display text-3xl font-black text-slate-900 tracking-tight mb-1">
          UNDUH FOTO DIGITAL 📱
        </h2>
        <p className="text-slate-500 text-xs font-semibold mb-6">
          Arahkan kamera smartphone ke QR Code untuk mengunduh softcopy 300 DPI
        </p>

        {/* QR Code Frame */}
        <div
          className="w-64 h-64 bg-white p-3 rounded-3xl shadow-xl border-4 flex items-center justify-center mb-6 overflow-hidden relative group"
          style={{ borderColor: `${themeColor}40` }}
        >
          {qrSrc ? (
            <img src={qrSrc} alt="QR Code Unduh Foto" className="w-full h-full object-contain rounded-xl" />
          ) : (
            <div className="w-full h-full bg-slate-100 animate-pulse rounded-xl" />
          )}
        </div>

        <div className="text-[11px] font-mono text-slate-400 font-bold mb-6 flex flex-col items-center gap-1">
          <span>ID SESI: {sessionId}</span>
          <span className="text-[10px] text-slate-400 font-normal truncate max-w-[320px]">
            {activeUrl || 'Menyiapkan tautan unduh...'}
          </span>
        </div>

        {/* Finish Button */}
        <button
          onClick={() => navigate('welcome')}
          style={{
            backgroundColor: themeColor,
            boxShadow: `0 10px 25px -5px ${themeColor}50`,
          }}
          className="w-full py-4 rounded-2xl font-display font-black text-white text-base tracking-wider uppercase transition-all duration-300 transform hover:scale-[1.02] active:scale-95 cursor-pointer"
        >
          SELESAIKAN SESI (SELESAI) ✓
        </button>
      </div>
    </div>
  );
}
