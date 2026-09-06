import { useState, useRef, useEffect, useCallback } from 'react';
import type { ScreenProps } from './WelcomeScreen';
import { kiosk, isElectron } from '../ipc/bridge';
import { useKioskConfig } from '../context/KioskConfigContext';

export default function CaptureScreen({ navigate, updateSession }: ScreenProps) {
  const [currentPose, setCurrentPose] = useState(1);
  const totalPoses = 4;
  const [countdown, setCountdown] = useState<number | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [webcamReady, setWebcamReady] = useState(false);
  const [liveViewSrc, setLiveViewSrc] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const liveViewSrcRef = useRef<string | null>(null);

  // Initialize Camera via IPC Bridge
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    async function initCamera() {
      try {
        const res = await kiosk.camera.startLiveView();
        
        // Listen for Canon EDSDK live view frames
        unsubscribe = kiosk.camera.onLiveViewFrame((frameData) => {
          liveViewSrcRef.current = frameData;
          setLiveViewSrc(frameData);
          setWebcamReady(true);
        });

        // If Electron reports WebRTC mode, or running in browser, start WebRTC immediately
        if ((res as any)?.mode === 'webrtc' || !isElectron()) {
          startWebRTCFallback();
        } else {
          // Safety timeout: If Canon was requested but no frame arrives within 2 seconds, start fallback
          fallbackTimer = setTimeout(() => {
            if (!liveViewSrcRef.current) {
              console.warn('[CaptureScreen] No Canon frame received within 2s, engaging fallback camera');
              startWebRTCFallback();
            }
          }, 2000);
        }

      } catch (err) {
        console.warn('IPC Camera failed, starting fallback:', err);
        startWebRTCFallback();
      }
    }

    function startWebRTCFallback() {
      if (videoRef.current && videoRef.current.srcObject) return;
      navigator.mediaDevices
        .getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'user' },
          audio: false,
        })
        .then((s) => {
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            setWebcamReady(true);
          }
        })
        .catch((err) => {
          console.warn('Webcam fallback failed:', err);
          setWebcamReady(true); // Allow user to still see UI instead of loading forever
        });
    }

    initCamera();

    return () => {
      if (unsubscribe) unsubscribe();
      if (fallbackTimer) clearTimeout(fallbackTimer);
      kiosk.camera.stopLiveView();
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Shutter Flash & Snapshot
  const takePhoto = useCallback(async () => {
    setIsCapturing(true);
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    let photoData = '';
    
    // In Electron: ALWAYS trigger native Canon shutter via IPC!
    if (isElectron()) {
      try {
        const result = await kiosk.camera.capturePhoto();
        if (result && typeof result === 'string' && result.length > 50) {
          photoData = result;
        }
      } catch (err) {
        console.error('Capture failed via IPC:', err);
      }
    }

    // WebRTC Fallback Mode (only if outside Electron or IPC had no result): Capture from video element
    if (!photoData && videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        photoData = canvas.toDataURL('image/jpeg', 0.95);
      }
    }

    // Safety fallback: Use latest LiveView sensor frame from Canon sensor so user always gets their photo
    if (!photoData && liveViewSrcRef.current) {
      console.log('[CaptureScreen] Using active LiveView sensor frame as photo fallback');
      photoData = liveViewSrcRef.current;
    }

    // Safety guard: If photo is still empty, do NOT record a blank slot or advance pose
    if (!photoData || photoData.length < 50) {
      console.warn('[CaptureScreen] Shutter result empty, will not record blank pose');
      setIsCapturing(false);
      return;
    }

    const nextPhotos = [...photos, photoData];
    setPhotos(nextPhotos);
    setIsCapturing(false);

    if (currentPose < totalPoses) {
      setCurrentPose((p) => p + 1);
    } else {
      updateSession({ photos: nextPhotos });
      setTimeout(() => navigate('filter'), 1000);
    }
  }, [currentPose, totalPoses, photos, updateSession, navigate]);

  const { config } = useKioskConfig();

  const takePhotoRef = useRef(takePhoto);
  takePhotoRef.current = takePhoto;

  // Trigger countdown
  const startCountdown = () => {
    if (isCapturing || !webcamReady || countdown !== null) return;
    setCountdown(config.countdown || 5);
  };

  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCountdown(null);
      takePhotoRef.current();
    }
  }, [countdown]);

  return (
    <div className="w-full h-full flex flex-col photolab-bg relative overflow-hidden">
      {/* Hidden canvas for snapshotting */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Shutter flash overlay */}
      {isFlashing && <div className="absolute inset-0 bg-white z-50 animate-flash pointer-events-none" />}

      {/* Header */}
      <div className="px-12 py-6 flex items-center justify-between z-10 bg-white/60 backdrop-blur-md">
        <div>
          <h2 className="font-display text-2xl font-black text-slate-800">
            POSE {currentPose} <span className="text-slate-400 font-medium text-lg">/ {totalPoses}</span>
          </h2>
          <p className="text-slate-500 text-xs font-semibold">Tatap kamera & berikan pose terbaikmu!</p>
        </div>
        <div className="flex gap-2">
          {Array.from({ length: totalPoses }).map((_, i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${
                i + 1 < currentPose
                  ? 'bg-emerald-500 scale-100'
                  : i + 1 === currentPose
                  ? 'bg-primary-600 ring-4 ring-primary-200 scale-125'
                  : 'bg-slate-300'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Camera Live View & Countdown Overlay */}
      <div className="flex-1 px-12 pb-6 flex gap-8 items-center justify-center">
        <div className="relative w-[800px] h-[550px] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border-4 border-white flex items-center justify-center">
          {liveViewSrc ? (
            <img src={liveViewSrc} className="w-full h-full object-cover -scale-x-100" alt="Live View" />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover -scale-x-100"
            />
          )}

          {!webcamReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-slate-800">
              <div className="w-12 h-12 border-4 border-primary-400 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="font-medium text-sm">Menghubungkan ke kamera...</p>
            </div>
          )}

          {/* Camera Source Badge */}
          {webcamReady && (
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white text-[11px] font-bold shadow-lg">
              <span className={`w-2 h-2 rounded-full ${liveViewSrc ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{liveViewSrc ? 'CANON DSLR (LIVE)' : 'WEBCAM BACKUP'}</span>
            </div>
          )}

          {/* Countdown Number Overlay (Huge Photolab Style) */}
          {countdown !== null && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-30">
              <span className="font-display text-[160px] font-black text-white drop-shadow-2xl animate-count-pulse">
                {countdown === 0 ? 'SMILE!' : countdown}
              </span>
            </div>
          )}
        </div>

        {/* Right Sidebar: Thumbnail Preview & Shutter Button */}
        <div className="flex flex-col items-center gap-6">
          <div className="w-36 bg-white p-4 rounded-3xl shadow-xl border border-slate-100 flex flex-col gap-3">
            <span className="text-[10px] font-extrabold text-slate-400 tracking-wider uppercase text-center">
              HASIL FOTO
            </span>
            {Array.from({ length: totalPoses }).map((_, idx) => (
              <div
                key={idx}
                className="w-full h-20 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center"
              >
                {photos[idx] ? (
                  <img src={photos[idx]} alt={`Pose ${idx + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-slate-300 font-black text-sm">{idx + 1}</span>
                )}
              </div>
            ))}
          </div>

          {/* Start Pose Button (Photolab CEKREK Button) */}
          <button
            onClick={startCountdown}
            disabled={countdown !== null || isCapturing || !webcamReady}
            className={`w-36 py-5 rounded-2xl font-display font-black text-white text-lg tracking-wider transition-all duration-300 shadow-xl ${
              countdown !== null || isCapturing || !webcamReady
                ? 'bg-slate-300 cursor-not-allowed shadow-none'
                : 'bg-primary-600 hover:bg-primary-700 hover:scale-105 shadow-primary-500/40'
            }`}
          >
            {isCapturing
              ? 'MENYIMPAN...'
              : countdown !== null
              ? 'MEMFOTO...'
              : !webcamReady
              ? 'SIAPKAN...'
              : 'CEKREK! 📸'}
          </button>
        </div>
      </div>
    </div>
  );
}
