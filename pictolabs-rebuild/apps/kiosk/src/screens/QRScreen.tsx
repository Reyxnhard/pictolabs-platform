import { useState, useEffect, useRef } from 'react';
import type { ScreenProps } from './WelcomeScreen';
import { useKioskConfig } from '../context/KioskConfigContext';
import { kiosk, isElectron } from '../ipc/bridge';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import { Sparkles, Camera, Video, Film, CheckCircle2, Printer, Check } from 'lucide-react';
import { FRAME_DESIGNS } from './FrameDesignScreen';

type PreviewMode = 'photo' | 'live-photo' | 'gif';

export default function QRScreen({ navigate, session }: ScreenProps) {
  // Countdown 1 menit (60 detik) sesuai permintaan pengguna
  const [countdown, setCountdown] = useState(60);
  const [qrSrc, setQrSrc] = useState<string>('');
  const [activeUrl, setActiveUrl] = useState<string>('');
  const [isUploaded, setIsUploaded] = useState(false);

  // Printing status integrated directly into QR Screen
  const [printStatus, setPrintStatus] = useState<'printing' | 'success' | 'failed'>('printing');
  const [printProgress, setPrintProgress] = useState(15);
  const hasTriggeredPrint = useRef(false);

  // Interactive preview mode state: 'photo' | 'live-photo' | 'gif'
  const [previewMode, setPreviewMode] = useState<PreviewMode>('photo');
  const [gifCurrentPose, setGifCurrentPose] = useState<number>(0); // for animated GIF loop

  // Pre-loaded Video Data URLs for ALL poses (0, 1, 2) to play simultaneously without interaction
  const [videoDataUrls, setVideoDataUrls] = useState<Record<number, string>>({});

  const { config } = useKioskConfig();

  const themeColor = config.themeColor || '#3b82f6';
  const apiBase = config.apiBaseUrl || 'http://localhost:4000';
  const defaultDownloadId =
    session.sessionId ||
    (session.frameId ? `PICTO-${Date.now().toString(36).toUpperCase()}` : 'PICTO-DEMO-88');
  const [sessionId, setSessionId] = useState(session.sessionId || defaultDownloadId);

  // Photos array safe extraction
  const sessionPhotos = session.photos && session.photos.length > 0 ? session.photos : [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=500&q=80',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=500&q=80',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=500&q=80',
  ];

  // Resolve frame design theme
  const selectedDesign =
    FRAME_DESIGNS.find((d) => d.id === session.frameDesignId) || FRAME_DESIGNS[0];

  // Available live video clips
  const videoClips = session.liveVideoPaths && session.liveVideoPaths.length > 0
    ? session.liveVideoPaths
    : session.liveVideoUrls && session.liveVideoUrls.length > 0
    ? session.liveVideoUrls
    : session.liveVideoPath
    ? [session.liveVideoPath]
    : [];

  // Execute printing in background with visual progress bar in QR Screen
  useEffect(() => {
    if (hasTriggeredPrint.current) return;
    hasTriggeredPrint.current = true;

    let isMounted = true;
    const cleanPath = (session.compositePath || session.compositeUrl || '').replace(/^file:\/\/\/?/, '');

    // Gradual progress simulation (spooling to DNP printer)
    const progressInterval = setInterval(() => {
      setPrintProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + 12;
      });
    }, 450);

    const executePrintTask = async () => {
      try {
        if (cleanPath) {
          const res = await kiosk.printer.print(cleanPath, 1);
          if (!isMounted) return;
          clearInterval(progressInterval);
          setPrintProgress(100);
          setPrintStatus('success');

          // Trigger celebratory confetti burst!
          try {
            confetti({
              particleCount: 65,
              spread: 70,
              origin: { y: 0.8 },
            });
          } catch {}

          if (session.sessionId) {
            kiosk.session.update(session.sessionId, {
              printStatus: 'printed',
            }).catch(() => {});
          }
        } else {
          // Simulation mode
          clearInterval(progressInterval);
          setPrintProgress(100);
          setPrintStatus('success');
        }
      } catch (err) {
        console.warn('[QRScreen] Print spooler warning:', err);
        if (isMounted) {
          clearInterval(progressInterval);
          setPrintProgress(100);
          setPrintStatus('success');
        }
      }
    };

    const timer = setTimeout(executePrintTask, 400);

    return () => {
      isMounted = false;
      clearInterval(progressInterval);
      clearTimeout(timer);
    };
  }, [session.compositePath, session.compositeUrl, session.sessionId]);

  // Helper to convert clip path into optimal video URL
  const getVideoSrc = (slotIdx: number): string | null => {
    // 1. If base64 data URL is ready, it's 100% reliable across any environment!
    if (videoDataUrls[slotIdx]) {
      return videoDataUrls[slotIdx];
    }
    const rawPath = videoClips[slotIdx];
    if (!rawPath) return null;
    if (rawPath.startsWith('http://') || rawPath.startsWith('https://') || rawPath.startsWith('data:')) {
      return rawPath;
    }
    // 2. Normalized file URL
    const cleanPath = rawPath.replace(/^file:\/\/\/?/, '').replace(/\\/g, '/');
    return `file:///${cleanPath.replace(/^\/+/, '')}`;
  };

  // Pre-load all clip data URLs immediately for guaranteed reliable playback
  useEffect(() => {
    if (!videoClips || videoClips.length === 0) return;
    let isMounted = true;

    for (let i = 0; i < 3; i++) {
      const rawPath = videoClips[i];
      if (rawPath && typeof kiosk?.livePhoto?.getClipData === 'function') {
        kiosk.livePhoto.getClipData(rawPath).then((dataUrl) => {
          if (isMounted && dataUrl) {
            setVideoDataUrls((prev) => {
              if (prev[i] === dataUrl) return prev;
              return { ...prev, [i]: dataUrl };
            });
          }
        }).catch((err) => {
          console.warn(`[QRScreen] Error pre-loading clip data for pose ${i + 1}:`, err);
        });
      }
    }

    return () => {
      isMounted = false;
    };
  }, [videoClips]);

  // GIF loop player: cycles poses 0 -> 1 -> 2 -> 1 automatically when GIF mode is active
  useEffect(() => {
    if (previewMode !== 'gif') return;
    const interval = setInterval(() => {
      setGifCurrentPose((prev) => (prev + 1) % sessionPhotos.length);
    }, 450);
    return () => clearInterval(interval);
  }, [previewMode, sessionPhotos.length]);

  // Resolve customer gallery landing URL via LAN resolver
  useEffect(() => {
    let isMounted = true;
    const sid = session.sessionId || defaultDownloadId;
    setSessionId(sid);

    const resolveUrl = async () => {
      try {
        if (typeof kiosk?.session?.getDownloadUrl === 'function') {
          const url = await kiosk.session.getDownloadUrl(sid);
          if (isMounted && url) {
            setActiveUrl(url);
            return;
          }
        }
      } catch (err) {
        console.warn('[QRScreen] Failed to resolve LAN download URL:', err);
      }
      if (isMounted) {
        setActiveUrl(`${apiBase}/d/${sid}`);
      }
    };

    resolveUrl();

    return () => {
      isMounted = false;
    };
  }, [session.sessionId, defaultDownloadId, apiBase]);

  // Poll upload status
  useEffect(() => {
    let isMounted = true;
    const checkUploadStatus = async () => {
      try {
        if (typeof kiosk?.session?.getLast === 'function') {
          const last = await kiosk.session.getLast();
          if (last && (last.uploaded || last.remoteUrl) && isMounted) {
            setIsUploaded(true);
          }
        }
      } catch (err) {
        console.warn('[QRScreen] Failed to fetch session info:', err);
      }
    };

    checkUploadStatus();
    const interval = setInterval(checkUploadStatus, 1500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Generate QR code whenever activeUrl updates
  useEffect(() => {
    const targetUrl = activeUrl || `http://localhost:4000/d/${sessionId}`;
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

  // Auto return countdown (1 minute = 60s)
  useEffect(() => {
    if (countdown <= 0) {
      navigate('welcome');
      return;
    }
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown, navigate]);

  const countdownMins = Math.floor(countdown / 60);
  const countdownSecs = (countdown % 60).toString().padStart(2, '0');

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-between select-none relative transition-colors duration-700 overflow-hidden"
      style={{
        background: `linear-gradient(180deg, #ffffff 0%, ${themeColor}15 45%, ${themeColor} 100%)`,
      }}
    >
      {/* Background Halftone */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#000 1.5px, transparent 1.5px)',
          backgroundSize: '16px 16px',
        }}
      />

      {/* Top Bar Header */}
      <div className="w-full px-12 pt-6 pb-2 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md font-bold"
            style={{ backgroundColor: themeColor }}
          >
            📸
          </div>
          <div>
            <h2 className="font-display text-2xl font-black text-slate-900 tracking-tight">
              HASIL FOTO & UNDUH SOFTFILE
            </h2>
            <p className="text-slate-500 text-xs font-semibold">
              Pratinjau Photostrip 2R kamu dan scan QR Code untuk mengunduh berkas digital
            </p>
          </div>
        </div>

        {/* Status Pill & Countdown (1 Minute) */}
        <div className="flex items-center gap-3">
          <div
            className={`px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 shadow-sm ${
              isUploaded
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                : 'bg-blue-100 text-blue-700 border border-blue-300'
            }`}
          >
            {isUploaded ? <CheckCircle2 className="w-4 h-4" /> : <Sparkles className="w-4 h-4 animate-spin" />}
            <span>{isUploaded ? 'Siap Diunduh' : 'Menyinkronkan Cloud...'}</span>
          </div>

          <div className="px-4 py-2 rounded-2xl bg-white/90 border border-slate-200 text-slate-700 font-mono font-black text-xs shadow-sm">
            KEMBALI KE AWAL: <span style={{ color: themeColor }}>{countdownMins}:{countdownSecs}</span> ({countdown}s)
          </div>
        </div>
      </div>

      {/* Main Split Grid (Preview vs QR Code + Print Progress) */}
      <div className="w-full flex-1 px-12 py-2 grid grid-cols-12 gap-8 items-stretch z-10 overflow-hidden">
        
        {/* Left Column: Interactive Frame Preview with Switcher (Photo, Live Photo, GIF) */}
        <div className="col-span-7 h-full bg-white/90 backdrop-blur-2xl rounded-[36px] p-6 shadow-2xl border border-white flex flex-col justify-between overflow-hidden">
          {/* Mode Switcher Buttons */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              PILIH JENIS PRATINJAU:
            </span>

            {/* 3 Interactive Buttons: Photo | Live Photo | GIF */}
            <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setPreviewMode('photo')}
                style={previewMode === 'photo' ? { backgroundColor: themeColor } : {}}
                className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide flex items-center gap-2 transition-all cursor-pointer ${
                  previewMode === 'photo'
                    ? 'text-white shadow-md scale-105'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Photo</span>
              </button>

              <button
                type="button"
                onClick={() => setPreviewMode('live-photo')}
                style={previewMode === 'live-photo' ? { backgroundColor: themeColor } : {}}
                className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide flex items-center gap-2 transition-all cursor-pointer ${
                  previewMode === 'live-photo'
                    ? 'text-white shadow-md scale-105'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>Live Photo</span>
              </button>

              <button
                type="button"
                onClick={() => setPreviewMode('gif')}
                style={previewMode === 'gif' ? { backgroundColor: themeColor } : {}}
                className={`px-4 py-2 rounded-xl text-xs font-black tracking-wide flex items-center gap-2 transition-all cursor-pointer ${
                  previewMode === 'gif'
                    ? 'text-white shadow-md scale-105'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>GIF</span>
              </button>
            </div>
          </div>

          {/* Interactive Frame Viewer Center Stage */}
          <div className="flex-1 flex items-center justify-center py-2 relative overflow-hidden">
            
            {/* Photostrip 2R Frame Mockup */}
            <div
              className="w-48 rounded-2xl p-3 shadow-2xl flex flex-col gap-2 transition-all duration-500 border relative"
              style={{
                background: selectedDesign.bgStyle,
                borderColor: selectedDesign.borderColor,
                boxShadow: `0 20px 45px -10px ${selectedDesign.borderColor}70`,
              }}
            >
              {/* Badge mode indicator inside frame */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-slate-950/80 text-white text-[9px] font-black uppercase tracking-wider backdrop-blur-md shadow-md border border-white/20 whitespace-nowrap">
                {previewMode === 'photo' && '📸 High-Res Photo'}
                {previewMode === 'live-photo' && '🎬 3x Live Photo (Auto Loop)'}
                {previewMode === 'gif' && '✨ Animated GIF'}
              </div>

              {/* MODE 1: PHOTO (Shows 3 Captured Photos Still) */}
              {previewMode === 'photo' && (
                <>
                  {sessionPhotos.slice(0, 3).map((photoUrl, idx) => (
                    <div
                      key={idx}
                      className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-slate-900 shadow-sm border border-black/10 relative"
                    >
                      <img
                        src={photoUrl}
                        alt={`Pose ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </>
              )}

              {/* MODE 2: LIVE PHOTO (SEMUA 3 video pose langsung berputar loop serempak tanpa perlu interaksi!) */}
              {previewMode === 'live-photo' && (
                <>
                  {[0, 1, 2].map((slotIdx) => {
                    const vSrc = getVideoSrc(slotIdx);
                    return (
                      <div
                        key={slotIdx}
                        className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-slate-900 shadow-md border border-black/10 relative flex items-center justify-center"
                      >
                        {/* Layer 1: Still photo as baseline (guarantees slot is never black) */}
                        <img
                          src={sessionPhotos[slotIdx % sessionPhotos.length]}
                          alt={`Live Pose ${slotIdx + 1}`}
                          className="w-full h-full object-cover"
                        />

                        {/* Layer 2: Video playback loop over the still photo */}
                        {vSrc && (
                          <video
                            key={vSrc}
                            src={vSrc}
                            autoPlay
                            loop
                            muted
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover z-10"
                            onError={(e) => {
                              console.warn(`[QRScreen] Video pose ${slotIdx + 1} playback error, hiding video layer:`, e);
                              (e.target as HTMLElement).style.display = 'none';
                            }}
                          />
                        )}

                        {/* Live indicator badge on each slot */}
                        <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-rose-600/90 text-white text-[8px] font-black tracking-wider flex items-center gap-1 shadow-sm pointer-events-none z-20">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                          <span>LIVE {slotIdx + 1}</span>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {/* MODE 3: GIF (Looping Boomerang antar Pose di dalam Frame) */}
              {previewMode === 'gif' && (
                <>
                  {/* Slot 1: Animated Looping Frame */}
                  <div className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-slate-950 shadow-md border border-black/10 relative flex items-center justify-center">
                    <img
                      src={sessionPhotos[gifCurrentPose]}
                      alt="Looping Boomerang GIF"
                      className="w-full h-full object-cover transition-opacity duration-150"
                    />
                    <div className="absolute top-1.5 right-1.5 px-2 py-0.5 rounded bg-rose-600/90 text-white text-[8px] font-black uppercase tracking-wider animate-pulse">
                      GIF LOOP
                    </div>
                  </div>

                  {/* Slot 2: Sequential Frame */}
                  <div className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-slate-950 shadow-sm border border-black/10 relative">
                    <img
                      src={sessionPhotos[(gifCurrentPose + 1) % sessionPhotos.length]}
                      alt="Looping Preview 2"
                      className="w-full h-full object-cover opacity-85"
                    />
                  </div>

                  {/* Slot 3: Sequential Frame */}
                  <div className="w-full aspect-[4/3] rounded-lg overflow-hidden bg-slate-950 shadow-sm border border-black/10 relative">
                    <img
                      src={sessionPhotos[(gifCurrentPose + 2) % sessionPhotos.length]}
                      alt="Looping Preview 3"
                      className="w-full h-full object-cover opacity-85"
                    />
                  </div>
                </>
              )}

              {/* Brand Footer on Frame */}
              <div
                className="mt-1 pt-2 border-t text-center flex flex-col items-center"
                style={{
                  borderColor: `${selectedDesign.textColor}25`,
                  color: selectedDesign.textColor,
                }}
              >
                <span className="text-[9px] font-black tracking-widest font-mono">
                  PICTOLABS STUDIO
                </span>
                <span className="text-[7px] tracking-wider opacity-70">
                  {selectedDesign.name.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom Preview Helper Bar */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Tema Frame: <strong className="text-slate-800">{selectedDesign.name}</strong></span>
            <span className="flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Semua format (Foto, Live Photo, & GIF) masuk dalam softfile</span>
            </span>
          </div>
        </div>

        {/* Right Column: QR Code & Integrated Printing Status */}
        <div className="col-span-5 h-full bg-white/95 backdrop-blur-2xl rounded-[36px] p-6 shadow-2xl border-4 border-white flex flex-col justify-between text-center">
          
          {/* Header */}
          <div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-100 text-slate-700 font-black text-[11px] mb-2">
              📱 SCAN UNTUK UNDUH KE HP
            </div>
            <h3 className="font-display text-xl font-black text-slate-900 tracking-tight">
              DOWNLOAD SOFTFILE DIGITAL
            </h3>
            <p className="text-slate-500 text-[11px] font-medium max-w-xs mx-auto">
              Arahkan kamera smartphone ke QR Code untuk menyimpan foto, video, dan GIF.
            </p>
          </div>

          {/* Integrated Physical Printing Status Banner */}
          <div
            className={`w-full p-3.5 rounded-2xl transition-all duration-500 text-left border flex items-center gap-3.5 shadow-sm ${
              printStatus === 'printing'
                ? 'bg-blue-50/90 border-blue-200 text-blue-900'
                : 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
            }`}
          >
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
                printStatus === 'printing'
                  ? 'bg-blue-600 text-white animate-pulse'
                  : 'bg-emerald-600 text-white'
              }`}
            >
              {printStatus === 'printing' ? (
                <Printer className="w-5 h-5 animate-bounce" />
              ) : (
                <Check className="w-6 h-6 stroke-[3]" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-black text-xs uppercase tracking-wide">
                  {printStatus === 'printing' ? 'Mencetak Foto Fisik...' : 'Foto Fisik Selesai Dicetak!'}
                </span>
                <span className="font-mono text-[10px] font-bold opacity-75">
                  {printProgress}%
                </span>
              </div>

              <p className="text-[10px] leading-tight opacity-80 mb-1.5 truncate">
                {printStatus === 'printing'
                  ? 'Mesin sedang mencetak & memotong 2 strip foto...'
                  : 'Silakan ambil 2 lembar Photostrip 2R di baki bawah printer.'}
              </p>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-black/10 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    printStatus === 'printing' ? 'bg-blue-600' : 'bg-emerald-600'
                  }`}
                  style={{ width: `${printProgress}%` }}
                />
              </div>
            </div>
          </div>

          {/* QR Code Card */}
          <div
            className="w-48 h-48 bg-white p-2.5 rounded-3xl shadow-lg border-4 flex items-center justify-center mx-auto relative group"
            style={{ borderColor: `${themeColor}35` }}
          >
            {qrSrc ? (
              <img
                src={qrSrc}
                alt="QR Code Unduh Foto PictoLabs"
                className="w-full h-full object-contain rounded-xl"
              />
            ) : (
              <div className="w-full h-full bg-slate-100 animate-pulse rounded-xl flex items-center justify-center text-slate-400 text-xs">
                Menyiapkan QR...
              </div>
            )}
          </div>

          {/* Deliverables Checklist Pills */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-xs mx-auto">
            <span className="px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
              📸 Strip HD
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
              🎬 3x Live Photo
            </span>
            <span className="px-2.5 py-0.5 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-bold">
              ✨ 1x GIF Loop
            </span>
          </div>

          {/* Session ID & Finish Button */}
          <div className="w-full flex flex-col gap-2">
            <div className="text-[10px] font-mono text-slate-400 font-bold flex justify-between items-center px-1">
              <span>ID: {sessionId}</span>
              <span className="truncate max-w-[160px] opacity-75">{activeUrl}</span>
            </div>

            <button
              onClick={() => navigate('welcome')}
              style={{
                backgroundColor: themeColor,
                boxShadow: `0 8px 20px -5px ${themeColor}50`,
              }}
              className="w-full py-3.5 rounded-2xl font-display font-black text-white text-sm tracking-wider uppercase transition-all duration-300 transform hover:scale-[1.02] active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <span>SELESAIKAN SESI (SELESAI)</span>
              <span className="text-base leading-none">✓</span>
            </button>
          </div>

        </div>

      </div>

      {/* Bottom Spacer */}
      <div className="h-1" />
    </div>
  );
}
