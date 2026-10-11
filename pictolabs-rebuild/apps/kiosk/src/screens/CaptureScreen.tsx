import { useState, useRef, useEffect, useCallback } from 'react';
import type { ScreenProps } from './WelcomeScreen';
import { kiosk, isElectron } from '../ipc/bridge';
import { useKioskConfig } from '../context/KioskConfigContext';
import { ArrowRight, RotateCcw } from 'lucide-react';

export default function CaptureScreen({ navigate, updateSession, session }: ScreenProps) {
  // Total poses: Photostrip 2R defaults to 3 poses
  const totalPoses = (() => {
    if (session?.productId === 'photostrip-2r' || session?.frameId === '2R' || session?.frameDesignId) return 3;
    if (session?.frameId === '2' || session?.frameId === '6') return 1;
    if (session?.frameId === '3') return 2;
    if (session?.frameId === '4') return 3;
    return 3; // Default Photostrip 2R standard
  })();

  // CRITICAL SESSION ISOLATION GUARD:
  // Only hydrate initial photos if this session is an explicit crash recovery resume!
  // Normal customer sessions MUST ALWAYS start with empty photos and currentPose = 1.
  const isRecoveredSession = Boolean(session?.isRecovered);
  const initialPhotos = (isRecoveredSession && Array.isArray(session?.photos)) ? session.photos : [];
  const initialPose = initialPhotos.length > 0 ? Math.min(initialPhotos.length + 1, totalPoses) : 1;

  const [currentPose, setCurrentPose] = useState(initialPose);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [photos, setPhotos] = useState<string[]>(initialPhotos);
  const [isFlashing, setIsFlashing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [webcamReady, setWebcamReady] = useState(false);
  const [cameraSource, setCameraSource] = useState<'canon' | 'webcam' | 'connecting'>('connecting');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isGeneratingLivePhoto, setIsGeneratingLivePhoto] = useState(false);

  // Post-Capture Photo Preview (manual advance/retake)
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  const internalImageRef = useRef<HTMLImageElement>(new Image());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recordingCanvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const isRecordingRef = useRef<boolean>(false);
  const animFrameIdRef = useRef<number | null>(null);
  const pendingClipsRef = useRef<Map<number, Promise<void>>>(new Map());
  const clipResolversRef = useRef<Map<number, () => void>>(new Map());

  const liveViewSrcRef = useRef<string | null>(null);
  const cameraSourceRef = useRef<'canon' | 'webcam' | 'connecting'>('connecting');
  cameraSourceRef.current = cameraSource;
  const hasCanonFrameRef = useRef(false);
  const isNavigatingRef = useRef(false);
  const isProcessingRef = useRef(false);
  const photosRef = useRef<string[]>(initialPhotos);
  const currentPoseRef = useRef(currentPose);
  currentPoseRef.current = currentPose;

  const activeSessionIdRef = useRef<string>(
    session.sessionId || `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );

  const { config } = useKioskConfig();
  const configRef = useRef(config);
  configRef.current = config;

  // Ensure sessionId is established in session state
  useEffect(() => {
    if (!session.sessionId) {
      updateSession({ sessionId: activeSessionIdRef.current });
    }
  }, [session.sessionId, updateSession]);

  // Initialize Camera via IPC Bridge
  useEffect(() => {
    let unsubscribeFrames: (() => void) | null = null;
    let unsubscribeStatus: (() => void) | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    function stopWebcamStream() {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      kiosk.camera.notifyWebcamReady?.(false).catch(() => {});
    }

    function handleWebcamFailure(code: string, message: string) {
      if (!isMounted) return;
      console.warn(`[CaptureScreen] Webcam failure [${code}]:`, message);
      stopWebcamStream();
      setWebcamReady(false);
      setCameraSource('connecting');
      setCameraError(
        code === 'ERR_WEBCAM_PERMISSION_DENIED'
          ? 'Izin akses webcam ditolak'
          : code === 'ERR_WEBCAM_NO_DEVICE'
          ? 'Perangkat webcam tidak ditemukan'
          : 'Kamera tidak dapat diakses'
      );
      kiosk.camera.notifyWebcamReady?.(false, code).catch(() => {});
    }

    function startWebRTCFallback() {
      if (!isMounted) return;
      if (hasCanonFrameRef.current) return;
      if (videoRef.current && videoRef.current.srcObject) return;

      console.log('[CaptureScreen] Engaging webcam stream fallback...');
      navigator.mediaDevices
        .getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 }, facingMode: 'user' },
          audio: false,
        })
        .then((stream) => {
          if (!isMounted || hasCanonFrameRef.current || cameraSourceRef.current === 'canon') {
            console.log('[CaptureScreen] Canon arrived or unmounted during getUserMedia; discarding webcam tracks');
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          const video = videoRef.current;
          if (!video) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          video.srcObject = stream;
          video.onloadedmetadata = () => {
            if (!isMounted || hasCanonFrameRef.current || cameraSourceRef.current === 'canon') {
              stream.getTracks().forEach((track) => track.stop());
              video.srcObject = null;
              return;
            }

            video.play()
              .then(() => {
                if (!isMounted) return;
                setCameraSource('webcam');
                setWebcamReady(true);
                setCameraError(null);
                kiosk.camera.notifyWebcamReady?.(true).catch(() => {});
                console.log('[CaptureScreen] ✓ Webcam stream confirmed active and ready');
              })
              .catch((playErr) => {
                handleWebcamFailure('ERR_WEBCAM_PLAYBACK', playErr.message);
              });
          };
        })
        .catch((err) => {
          const code =
            err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
              ? 'ERR_WEBCAM_PERMISSION_DENIED'
              : err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError'
              ? 'ERR_WEBCAM_NO_DEVICE'
              : 'ERR_WEBCAM_FAILED';
          handleWebcamFailure(code, err.message);
        });
    }

    async function initCamera() {
      try {
        const res = await kiosk.camera.startLiveView();

        // Listen for Canon EDSDK live view frames: Direct Canvas Rendering
        unsubscribeFrames = kiosk.camera.onLiveViewFrame((frameData) => {
          if (!isMounted) return;
          liveViewSrcRef.current = frameData;

          if (!hasCanonFrameRef.current) {
            hasCanonFrameRef.current = true;
            // Canon is active: cleanly stop any running webcam stream!
            stopWebcamStream();
            setCameraSource('canon');
            setWebcamReady(true);
            setCameraError(null);
            console.log('[CaptureScreen] ✓ Canon LiveView stream active');
          }

          const img = internalImageRef.current;
          img.onload = () => {
            const canvas = liveCanvasRef.current;
            if (!canvas) return;
            const nw = img.naturalWidth || 960;
            const nh = img.naturalHeight || 640;
            if (canvas.width !== nw || canvas.height !== nh) {
              canvas.width = nw;
              canvas.height = nh;
            }
            const ctx = canvas.getContext('2d', { alpha: false });
            if (ctx) {
              ctx.drawImage(img, 0, 0, nw, nh);
            }
          };
          img.src = frameData;
        });

        // Subscribe to Camera Status changes to detect disconnect/reconnect in real time!
        if (typeof kiosk.camera.onCameraStatusChanged === 'function') {
          unsubscribeStatus = kiosk.camera.onCameraStatusChanged((status) => {
            if (!isMounted) return;
            console.log('[CaptureScreen] Camera status update:', status);

            if (!status.isCanonConnected || status.activeSensor !== 'canon') {
              if (hasCanonFrameRef.current) {
                console.warn('[CaptureScreen] Canon disconnected while active! Switching to webcam fallback...');
                hasCanonFrameRef.current = false;
                liveViewSrcRef.current = null;
                const canvas = liveCanvasRef.current;
                if (canvas) {
                  const ctx = canvas.getContext('2d');
                  ctx?.clearRect(0, 0, canvas.width, canvas.height);
                }
                setWebcamReady(false);
                setCameraSource('connecting');
                startWebRTCFallback();
              }
            }
          });
        }

        // If Electron reports WebRTC mode, or running in browser, start WebRTC immediately
        if ((res as any)?.mode === 'webrtc' || !isElectron()) {
          startWebRTCFallback();
        } else {
          // Safety timeout: If Canon was requested but no frame arrives within 2 seconds, start fallback
          fallbackTimer = setTimeout(() => {
            if (!hasCanonFrameRef.current && isMounted) {
              console.warn('[CaptureScreen] No Canon frame received within 2s, engaging fallback camera');
              startWebRTCFallback();
            }
          }, 2000);
        }

      } catch (err) {
        console.warn('[CaptureScreen] IPC Camera startLiveView failed, engaging fallback:', err);
        startWebRTCFallback();
      }
    }

    initCamera();

    return () => {
      isMounted = false;
      if (unsubscribeFrames) unsubscribeFrames();
      if (unsubscribeStatus) unsubscribeStatus();
      if (fallbackTimer) clearTimeout(fallbackTimer);
      liveViewSrcRef.current = null;
      kiosk.camera.stopLiveView();
      stopWebcamStream();
    };
  }, []);

  // ─── Initialize WebCodecs Video Encoder Web Worker ───────
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(
        new URL('../workers/videoEncoder.worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = async (e: MessageEvent) => {
        const { type, blob, videoIndex } = e.data;
        if (type === 'done') {
          try {
            if (blob && blob.size > 0) {
              const arrayBuffer = await blob.arrayBuffer();
              const res = typeof kiosk.livePhoto?.saveClipBuffer === 'function'
                ? await kiosk.livePhoto.saveClipBuffer(activeSessionIdRef.current, videoIndex, arrayBuffer)
                : await kiosk.livePhoto.saveClip(activeSessionIdRef.current, videoIndex, arrayBuffer);
              console.log(`[CaptureScreen] ✓ Saved WebCodecs Live Photo clip for pose ${videoIndex}:`, res.filePath);
            }
          } catch (saveErr) {
            console.error('[CaptureScreen] Error saving WebCodecs Live Photo clip:', saveErr);
          } finally {
            const resolver = clipResolversRef.current.get(videoIndex);
            if (resolver) {
              resolver();
              clipResolversRef.current.delete(videoIndex);
            }
          }
        }
      };

      workerRef.current = worker;
      console.log('[CaptureScreen] ✓ WebCodecs VideoEncoder worker ready');
    } catch (workerErr) {
      console.warn('[CaptureScreen] WebCodecs Worker initialization warning:', workerErr);
    }

    return () => {
      if (worker) {
        worker.terminate();
      }
      workerRef.current = null;
    };
  }, []);

  // ─── Live Photo Video Recording Engine (WebCodecs + Worker) ─
  const startRecording = useCallback(() => {
    if (isRecordingRef.current) return;
    isRecordingRef.current = true;

    const canvas = recordingCanvasRef.current;
    if (!canvas) return;

    // Detect natural source dimensions & aspect ratio to prevent squashing ("gepeng")
    let srcW = 1280;
    let srcH = 720;

    if (cameraSourceRef.current === 'canon' && internalImageRef.current.complete) {
      srcW = internalImageRef.current.naturalWidth || 960;
      srcH = internalImageRef.current.naturalHeight || 640;
    } else if (videoRef.current && videoRef.current.videoWidth > 0) {
      srcW = videoRef.current.videoWidth;
      srcH = videoRef.current.videoHeight;
    }

    // Standardize to 720p height with exact matching aspect ratio (even width for YUV420p)
    // Canon DSLR 3:2 -> 1080x720, HD Webcam 16:9 -> 1280x720, 4:3 Webcam -> 960x720
    const sourceAspect = (srcW > 0 && srcH > 0) ? srcW / srcH : 16 / 9;
    const targetHeight = 720;
    const targetWidth = Math.max(320, Math.round((targetHeight * sourceAspect) / 2) * 2);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const poseIndex = currentPoseRef.current;
    let resolveClip: () => void;
    const clipPromise = new Promise<void>((resolve) => {
      resolveClip = resolve;
    });
    clipResolversRef.current.set(poseIndex, resolveClip!);
    pendingClipsRef.current.set(poseIndex, clipPromise);

    const worker = workerRef.current;
    if (worker) {
      worker.postMessage({
        type: 'start',
        data: {
          width: targetWidth,
          height: targetHeight,
          index: poseIndex,
          frameRate: 30,
          bitrate: 4_000_000,
        },
      });
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    let lastFrameTime = 0;
    const FRAME_INTERVAL = 1000 / 30; // 33.3ms for smooth 30fps

    // Aspect-ratio-preserving cover drawing helper to guarantee 0% distortion
    const drawImageCover = (
      img: HTMLImageElement | HTMLVideoElement,
      mirror = false
    ) => {
      if (!ctx) return;
      const nw = (img as HTMLVideoElement).videoWidth || (img as HTMLImageElement).naturalWidth || img.width;
      const nh = (img as HTMLVideoElement).videoHeight || (img as HTMLImageElement).naturalHeight || img.height;
      if (!nw || !nh) return;

      const scale = Math.max(canvas.width / nw, canvas.height / nh);
      const sw = canvas.width / scale;
      const sh = canvas.height / scale;
      const sx = Math.max(0, (nw - sw) / 2);
      const sy = Math.max(0, (nh - sh) / 2);

      ctx.save();
      if (mirror) {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    };

    const drawFrame = (time: number) => {
      if (!isRecordingRef.current) return;

      if (time - lastFrameTime >= FRAME_INTERVAL) {
        lastFrameTime = time;

        if (ctx) {
          const shouldMirrorResult = configRef.current?.cameraResult !== 'original';
          if (cameraSourceRef.current === 'canon' && internalImageRef.current.complete) {
            // Canon DSLR Live View frame (mirrored if cameraResult is mirror, matching countdown viewfinder)
            drawImageCover(internalImageRef.current, shouldMirrorResult);
          } else if (videoRef.current && videoRef.current.videoWidth > 0) {
            // Webcam fallback (mirrored if cameraResult is mirror)
            drawImageCover(videoRef.current, shouldMirrorResult);
          }
        }

        // Send zero-copy transferable ImageBitmap to worker
        createImageBitmap(canvas).then((bitmap) => {
          const activeWorker = workerRef.current;
          if (!activeWorker || !isRecordingRef.current) {
            bitmap.close();
            return;
          }
          activeWorker.postMessage(
            { type: 'frame', data: { imageBitmap: bitmap } },
            [bitmap]
          );
        }).catch(() => {});
      }

      animFrameIdRef.current = requestAnimationFrame(drawFrame);
    };

    animFrameIdRef.current = requestAnimationFrame(drawFrame);
    console.log(`[CaptureScreen] WebCodecs Live Photo recording started for pose ${poseIndex} (${targetWidth}x${targetHeight})`);
  }, []);


  const stopRecording = useCallback((poseIndex: number) => {
    isRecordingRef.current = false;
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    const worker = workerRef.current;
    if (worker) {
      worker.postMessage({
        type: 'stop',
        data: { success: true, poseIndex },
      });
    }
  }, []);

  // Advance to next pose or next screen
  const handleNext = useCallback(async () => {
    if (isNavigatingRef.current) return;
    setPreviewPhoto(null);

    const activePose = currentPoseRef.current;
    if (activePose < totalPoses) {
      const nextPose = activePose + 1;
      setCurrentPose(nextPose);
      currentPoseRef.current = nextPose;

      // Auto countdown & Live Photo recording activated for photo 2 and subsequent photos!
      setTimeout(() => {
        setCountdown(config.countdown || 5);
        startRecording();
      }, 600);
    } else {
      isNavigatingRef.current = true;
      isProcessingRef.current = true;
      // Completed all poses! Wait for any pending clip encoding to finish before finalization
      setIsGeneratingLivePhoto(true);
      try {
        const pending = Array.from(pendingClipsRef.current.values());
        if (pending.length > 0) {
          console.log(`[CaptureScreen] Waiting for ${pending.length} Live Photo clips to finalize encoding...`);
          await Promise.race([
            Promise.all(pending),
            new Promise((r) => setTimeout(r, 4000)),
          ]);
        }

        console.log(`[CaptureScreen] Finalizing ${totalPoses} separate Live Photo clips...`);
        const finalizeRes = typeof kiosk.livePhoto?.finalize === 'function'
          ? await kiosk.livePhoto.finalize(activeSessionIdRef.current, totalPoses)
          : await kiosk.livePhoto.generate(activeSessionIdRef.current, totalPoses);

        console.log('[CaptureScreen] ✓ Separate Live Photos finalized:', finalizeRes.videoPaths);
        updateSession({
          photos: photosRef.current,
          sessionId: activeSessionIdRef.current,
          liveVideoPaths: finalizeRes.videoPaths,
          liveVideoPath: finalizeRes.videoPaths?.[0] || finalizeRes.videoPath,
        });

        if (activeSessionIdRef.current) {
          kiosk.recovery?.checkpoint?.(activeSessionIdRef.current, 'CAPTURE_COMPLETE', totalPoses, {
            photos: photosRef.current,
            liveVideoPaths: finalizeRes.videoPaths,
          }).catch(() => {});
        }
      } catch (err) {
        console.warn('[CaptureScreen] Live Photo finalization warning:', err);
        updateSession({
          photos: photosRef.current,
          sessionId: activeSessionIdRef.current,
        });
      } finally {
        setIsGeneratingLivePhoto(false);
        isProcessingRef.current = false;
        navigate('filter');
      }
    }
  }, [totalPoses, config.countdown, updateSession, navigate, startRecording]);

  // Retake photo for the current pose (with auto countdown & re-record)
  const handleRetake = useCallback(() => {
    if (isNavigatingRef.current || isProcessingRef.current) return;

    // Discard the last captured photo from session and unlink from disk if local path
    const lastPhoto = photosRef.current[photosRef.current.length - 1];
    if (lastPhoto && !lastPhoto.startsWith('data:image')) {
      kiosk.camera?.discardCapture?.(lastPhoto).catch(() => {});
    }

    const updatedPhotos = photosRef.current.slice(0, -1);
    photosRef.current = updatedPhotos;
    setPhotos(updatedPhotos);
    updateSession({ photos: updatedPhotos });

    if (activeSessionIdRef.current) {
      kiosk.recovery?.checkpoint?.(activeSessionIdRef.current, 'CAPTURING', Math.max(0, currentPoseRef.current - 1), {
        photos: updatedPhotos,
      }).catch(() => {});
    }

    // Dismiss preview to return to Live View on the same pose
    setPreviewPhoto(null);

    // Automatically trigger countdown & Live Photo recording for retake!
    setTimeout(() => {
      setCountdown(config.countdown || 5);
      startRecording();
    }, 600);
  }, [config.countdown, updateSession, startRecording]);

  // Shutter Flash & Snapshot
  const takePhoto = useCallback(async () => {
    setIsCapturing(true);
    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    let photoData = '';
    const shouldMirror = configRef.current?.cameraResult !== 'original';
    const activeSensor = cameraSourceRef.current;

    console.log(`[CaptureScreen] Executing shutter for activeSensor: ${activeSensor}`);

    if (activeSensor === 'canon') {
      // ── SENSOR PARITY: Canon Preview -> Canon Final Still ──
      if (isElectron()) {
        try {
          const result = await kiosk.camera.capturePhoto({
            mirrorResult: shouldMirror,
            sensor: 'canon',
          });
          if (typeof result === 'string' && result.length > 50) {
            photoData = result;
          } else if (result && typeof result === 'object' && (result as any).success && (result as any).dataUrl) {
            photoData = (result as any).dataUrl;
          }
        } catch (err) {
          console.error('[CaptureScreen] Canon capture failed via IPC:', err);
        }
      }

      // Mode C in-renderer fallback ONLY if Canon was active sensor and has valid LiveView frame
      if (!photoData && liveViewSrcRef.current && hasCanonFrameRef.current) {
        console.log('[CaptureScreen] Using active Canon LiveView sensor frame as photo fallback');
        if (shouldMirror && canvasRef.current && internalImageRef.current.complete) {
          const img = internalImageRef.current;
          const canvas = canvasRef.current;
          canvas.width = img.naturalWidth || 1280;
          canvas.height = img.naturalHeight || 720;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(img, 0, 0);
            photoData = canvas.toDataURL('image/jpeg', 0.95);
          }
        }
        if (!photoData) {
          photoData = liveViewSrcRef.current;
        }
      }
    } else if (activeSensor === 'webcam') {
      // ── SENSOR PARITY: Webcam Preview -> Webcam Final Still ──
      // NEVER trigger Canon shutter release or SD card download!
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            if (shouldMirror) {
              ctx.translate(canvas.width, 0);
              ctx.scale(-1, 1);
            }
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            photoData = canvas.toDataURL('image/jpeg', 0.95);
          }
        } else {
          console.warn('[CaptureScreen] Webcam video element has 0 dimensions during shutter');
        }
      }
    } else {
      console.warn('[CaptureScreen] Shutter invoked but no camera sensor is active');
    }

    // STRICT VALIDATION: If photoData is missing or invalid, FAIL EXPLICITLY.
    // Do NOT advance pose, do NOT push empty/synthetic photo to session.
    if (!photoData || photoData.length < 50) {
      console.warn('[CaptureScreen] Shutter result empty or failed. Will not record fake photo or advance pose.');
      setIsCapturing(false);
      setCameraError('Gagal mengambil foto. Silakan tekan CEKREK untuk mencoba lagi.');
      return;
    }

    setCameraError(null);
    const nextPhotos = [...photosRef.current, photoData];
    setPhotos(nextPhotos);
    photosRef.current = nextPhotos;
    updateSession({ photos: nextPhotos });
    setIsCapturing(false);

    if (activeSessionIdRef.current) {
      kiosk.recovery?.checkpoint?.(activeSessionIdRef.current, 'CAPTURING', currentPoseRef.current, {
        photos: nextPhotos,
      }).catch(() => {});
    }

    // Show captured photo preview (clean, waiting for user decision)
    setPreviewPhoto(photoData);
  }, [updateSession]);

  const takePhotoRef = useRef(takePhoto);
  takePhotoRef.current = takePhoto;

  // Trigger countdown
  const startCountdown = () => {
    if (isNavigatingRef.current || isProcessingRef.current || isCapturing || !webcamReady || countdown !== null || previewPhoto) return;
    setCountdown(config.countdown || 5);
    startRecording();
  };

  // Countdown timer effect
  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      const timer = setTimeout(() => {
        setCountdown((prev) => (prev !== null ? prev - 1 : null));
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Countdown reached 0: Stop recording clip for this pose, show 'SMILE!' for 600ms, then take photo
      stopRecording(currentPoseRef.current);
      const timer = setTimeout(() => {
        setCountdown(null);
        takePhotoRef.current();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [countdown, stopRecording]);

  // Universal button action handler
  const handleShutterAction = () => {
    if (previewPhoto) {
      handleNext();
      return;
    }
    if (isCapturing || !webcamReady || countdown !== null) return;
    startCountdown();
  };

  return (
    <div className="w-full h-full flex flex-col photolab-bg relative overflow-hidden">
      {/* Hidden canvases for snapshotting and video recording */}
      <canvas ref={canvasRef} className="hidden" />
      <canvas ref={recordingCanvasRef} width={1280} height={720} className="hidden" />

      {/* Generating Live Photo Video Overlay */}
      {isGeneratingLivePhoto && (
        <div className="absolute inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col items-center justify-center text-white">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-4" />
          <h3 className="text-2xl font-black font-display tracking-wide">MEMBUAT LIVE PHOTO 🎬</h3>
          <p className="text-slate-400 text-sm font-medium mt-1">Menggabungkan klip video countdown & foto HD...</p>
        </div>
      )}

      {/* Shutter flash overlay */}
      {isFlashing && <div className="absolute inset-0 bg-white z-50 animate-flash pointer-events-none" />}

      {/* Header */}
      <div className="px-12 py-6 flex items-center justify-between z-10 bg-white/60 backdrop-blur-md">
        <div>
          <h2 className="font-display text-2xl font-black text-slate-800">
            POSE {currentPose} <span className="text-slate-400 font-medium text-lg">/ {totalPoses}</span>
          </h2>
          <p className="text-slate-500 text-xs font-semibold">
            {previewPhoto 
              ? 'Periksa hasil fotomu: pilih Foto Ulang atau Lanjut' 
              : 'Tatap kamera & berikan pose terbaikmu!'}
          </p>
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

      {/* Camera Live View & Preview Viewport */}
      <div className="flex-1 px-12 pb-6 flex gap-8 items-center justify-center">
        <div className="relative w-[800px] h-[550px] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border-4 border-white flex items-center justify-center">
          {/* Canon Live View Direct Canvas (Zero React Re-render) */}
          <canvas
            ref={liveCanvasRef}
            className={`w-full h-full object-cover transition-transform duration-200 ${
              cameraSource === 'canon' ? 'block' : 'hidden'
            } ${config.cameraPreview !== 'original' ? '-scale-x-100' : ''}`}
          />

          {/* WebRTC Video Fallback */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transition-transform duration-200 ${
              cameraSource === 'webcam' ? 'block' : 'hidden'
            } ${config.cameraPreview !== 'original' ? '-scale-x-100' : ''}`}
          />

          {!webcamReady && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white bg-slate-800 p-6 text-center">
              {cameraError ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-3 text-2xl font-bold">
                    ⚠️
                  </div>
                  <p className="font-bold text-sm text-rose-300">{cameraError}</p>
                  <p className="text-xs text-slate-400 mt-1">Periksa kabel USB kamera Canon atau izin webcam</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 border-4 border-primary-400 border-t-transparent rounded-full animate-spin mb-4" />
                  <p className="font-medium text-sm">Menghubungkan ke kamera...</p>
                </>
              )}
            </div>
          )}

          {/* Capture Error Banner when camera is ready but last shutter failed */}
          {webcamReady && cameraError && !previewPhoto && (
            <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-xl bg-rose-600/90 text-white text-xs font-bold shadow-lg animate-bounce">
              {cameraError}
            </div>
          )}

          {/* Camera Source Badge (No drop-shadow, subtle opacity) */}
          {webcamReady && !previewPhoto && (
            <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/40 border border-white/10 text-white/70 text-[11px] font-bold shadow-none">
              <span className={`w-2 h-2 rounded-full ${cameraSource === 'canon' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{cameraSource === 'canon' ? 'CANON DSLR (LIVE)' : 'WEBCAM BACKUP'}</span>
            </div>
          )}

          {/* Live Photo Recording Badge during countdown */}
          {countdown !== null && !previewPhoto && (
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-950/60 border border-rose-500/30 text-rose-200 text-[11px] font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span>LIVE PHOTO 🔴</span>
            </div>
          )}

          {/* Countdown Number Overlay (No drop-shadow, 50% opacity) */}
          {countdown !== null && !previewPhoto && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
              <span className="font-display text-[160px] font-black text-white/50 animate-count-pulse select-none">
                {countdown === 0 ? 'SMILE!' : countdown}
              </span>
            </div>
          )}

          {/* PHOTO PREVIEW OVERLAY - Clean frame without badges on top */}
          {previewPhoto && (
            <div className="absolute inset-0 z-40 bg-slate-950 flex flex-col items-center justify-center">
              {/* Captured Photo */}
              <img
                src={previewPhoto}
                className="w-full h-full object-contain"
                alt={`Hasil Jepretan Pose ${currentPose}`}
              />

              {/* Bottom Action Bar: Retake & Lanjut (No drop-shadow, clean translucent styling) */}
              <div className="absolute bottom-6 inset-x-0 flex items-center justify-center gap-5 z-50 px-8">
                {/* Retake Button */}
                <button
                  type="button"
                  onClick={handleRetake}
                  className="px-7 py-3.5 rounded-2xl bg-black/50 hover:bg-black/80 active:scale-95 text-white/90 font-bold text-sm border border-white/20 backdrop-blur-sm hover:scale-105 transition-all flex items-center gap-2.5 cursor-pointer shadow-none"
                >
                  <RotateCcw className="w-4 h-4 text-amber-400" />
                  <span>Foto Ulang</span>
                </button>

                {/* Lanjut Button */}
                <button
                  type="button"
                  onClick={handleNext}
                  className="px-9 py-3.5 rounded-2xl bg-white/75 hover:bg-white active:scale-95 text-slate-900 font-black text-sm hover:scale-105 transition-all flex items-center gap-2 cursor-pointer shadow-none"
                >
                  <span>Lanjut</span>
                  <ArrowRight className="w-4 h-4 text-slate-900" />
                </button>
              </div>
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
                className={`w-full h-20 bg-slate-100 rounded-xl overflow-hidden border-2 flex items-center justify-center transition-all ${
                  idx + 1 === currentPose && previewPhoto
                    ? 'border-emerald-500 shadow-md ring-2 ring-emerald-300'
                    : photos[idx]
                    ? 'border-slate-300'
                    : 'border-slate-200'
                }`}
              >
                {photos[idx] ? (
                  <img src={photos[idx]} alt={`Pose ${idx + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-slate-300 font-black text-sm">{idx + 1}</span>
                )}
              </div>
            ))}
          </div>

          {/* Start Pose Button (Photolab CEKREK / LANJUT / FOTO ULANG) */}
          <div className="w-36 flex flex-col gap-2.5">
            <button
              onClick={handleShutterAction}
              disabled={!previewPhoto && (isCapturing || !webcamReady || countdown !== null)}
              className={`w-full py-5 rounded-2xl font-display font-black text-white text-base tracking-wider transition-all duration-300 shadow-xl flex flex-col items-center justify-center gap-0.5 ${
                previewPhoto
                  ? 'bg-emerald-600 hover:bg-emerald-700 hover:scale-105 shadow-emerald-500/40 cursor-pointer'
                  : isCapturing
                  ? 'bg-slate-400 cursor-wait'
                  : countdown !== null
                  ? 'bg-amber-500 shadow-amber-500/30 cursor-not-allowed'
                  : !webcamReady
                  ? 'bg-slate-300 cursor-not-allowed shadow-none'
                  : 'bg-primary-600 hover:bg-primary-700 hover:scale-105 shadow-primary-500/40 cursor-pointer'
              }`}
            >
              {previewPhoto ? (
                <span className="flex items-center gap-1.5">
                  Lanjut <ArrowRight className="w-4 h-4" />
                </span>
              ) : isCapturing ? (
                <span>MENYIMPAN...</span>
              ) : countdown !== null ? (
                <>
                  <span className="text-xl font-black">{countdown === 0 ? '📸' : `${countdown}s`}</span>
                  <span className="text-[9px] font-bold text-amber-100 uppercase">
                    {countdown === 0 ? 'SMILE!' : 'Bersiap...'}
                  </span>
                </>
              ) : !webcamReady ? (
                <span>SIAPKAN...</span>
              ) : (
                <span>CEKREK! 📸</span>
              )}
            </button>

            {/* If in preview mode, also provide quick Foto Ulang in sidebar */}
            {previewPhoto && (
              <button
                type="button"
                onClick={handleRetake}
                className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all flex items-center justify-center gap-1.5 border border-slate-200 shadow-sm cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                <span>Foto Ulang</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
