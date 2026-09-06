import { Muxer, ArrayBufferTarget } from 'webm-muxer';

/**
 * WebCodecs Video Encoder Worker (Mirroring Photolab's videoWorker engine)
 *
 * Runs video encoding off the main React UI thread:
 * 1. Receives transferable ImageBitmap frames from canvas/camera
 * 2. Encodes using hardware/native Chromium VideoEncoder (VP8)
 * 3. Muxes into WebM using webm-muxer
 * 4. Yields clean, lag-free 30-60 FPS video clips
 */

let encoder: VideoEncoder | null = null;
let muxer: Muxer<ArrayBufferTarget> | null = null;
let startTime: number | null = null;
let currentVideoIndex = 0;
let isEncoding = false;
let frameCount = 0;
const DEFAULT_FRAME_RATE = 30;
const DEFAULT_BITRATE = 4_000_000; // 4 Mbps (crisp HD quality)

const log = (message: string) => {
  self.postMessage({ type: 'log', message });
};

const cleanupEncoder = (reason: string) => {
  log(`cleanupEncoder called - reason: ${reason}, state: ${encoder?.state ?? 'null'}`);
  if (encoder && encoder.state !== 'closed') {
    try {
      encoder.close();
    } catch (err: any) {
      log(`Encoder close error (ignored): ${err.message}`);
    }
  }
  encoder = null;
};

const cleanupMuxer = (reason: string) => {
  log(`cleanupMuxer called - reason: ${reason}, muxer exists: ${!!muxer}`);
  if (muxer) {
    try {
      muxer.finalize();
    } catch (err: any) {
      log(`Muxer finalize error (ignored): ${err.message}`);
    }
  }
  muxer = null;
};

self.onmessage = async (e: MessageEvent) => {
  const { type, data } = e.data;

  // ─── 1. START RECORDING SESSION ────────────────────────────
  if (type === 'start') {
    const width = data.width || 1280;
    const height = data.height || 720;
    const frameRate = data.frameRate || DEFAULT_FRAME_RATE;
    const bitrate = data.bitrate || DEFAULT_BITRATE;

    log(`=== START received === index: ${data.index}, ${width}x${height} @ ${frameRate}fps, ${bitrate / 1e6}Mbps`);

    cleanupEncoder('new start');
    cleanupMuxer('new start');

    currentVideoIndex = data.index;
    startTime = performance.now();
    isEncoding = true;
    frameCount = 0;

    try {
      muxer = new Muxer({
        target: new ArrayBufferTarget(),
        firstTimestampBehavior: 'offset',
        video: {
          codec: 'V_VP8',
          width,
          height,
          frameRate,
        },
      });

      encoder = new VideoEncoder({
        output: (chunk, meta) => {
          if (muxer) {
            muxer.addVideoChunk(chunk, meta);
          }
        },
        error: (err) => {
          log(`ENCODER ERROR CALLBACK: ${err.message}`);
          self.postMessage({ type: 'error', message: err.message });
        },
      });

      encoder.configure({
        codec: 'vp8',
        width,
        height,
        bitrate,
        framerate: frameRate,
      });

      log(`Encoder configured successfully, state: ${encoder.state}`);
    } catch (err: any) {
      log(`Failed to initialize VideoEncoder/Muxer: ${err.message}`);
      self.postMessage({ type: 'error', message: err.message });
    }
  }

  // ─── 2. RECEIVE VIDEO FRAME ────────────────────────────────
  if (type === 'frame') {
    const { imageBitmap } = data as { imageBitmap: ImageBitmap };

    if (!isEncoding || !encoder || encoder.state !== 'configured') {
      imageBitmap?.close();
      return;
    }

    // Backpressure handling: drop frame if encoder queue is backed up
    if (encoder.encodeQueueSize > 2) {
      imageBitmap.close();
      return;
    }

    if (startTime === null) {
      imageBitmap.close();
      return;
    }

    try {
      const elapsedTime = performance.now() - startTime;
      const timestamp = Math.round(elapsedTime * 1000); // Microseconds for WebCodecs
      const frame = new VideoFrame(imageBitmap, { timestamp });

      const isKeyFrame = frameCount % 30 === 0;
      frameCount++;

      if (encoder.state === 'configured') {
        encoder.encode(frame, { keyFrame: isKeyFrame });
      }
      frame.close();
    } catch (err: any) {
      log(`Frame encode error: ${err.message}`);
      self.postMessage({ type: 'error', message: err.message });
    } finally {
      imageBitmap.close();
    }
  }

  // ─── 3. STOP RECORDING SESSION ─────────────────────────────
  if (type === 'stop') {
    log(`=== STOP received === videoIndex: ${currentVideoIndex}`);
    isEncoding = false;

    if (!encoder || !muxer) {
      log(`Early exit - encoder: ${!!encoder}, muxer: ${!!muxer}`);
      self.postMessage({
        type: 'done',
        blob: new Blob([], { type: 'video/webm' }),
        videoIndex: currentVideoIndex,
      });
      startTime = null;
      return;
    }

    try {
      if (encoder.state === 'configured') {
        try {
          await Promise.race([
            encoder.flush(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('flush timeout after 6s')), 6000)),
          ]);
          log('Encoder flushed successfully');
        } catch (flushErr: any) {
          log(`Flush notice: ${flushErr.message} — finalizing with available chunks`);
        }
      }

      cleanupEncoder('stop complete');
      startTime = null;

      muxer.finalize();
      const buffer = muxer.target.buffer;
      const blob = new Blob([buffer], { type: 'video/webm' });
      muxer = null;

      log(`=== STOP complete === blob size: ${blob.size} bytes for pose ${currentVideoIndex}`);
      self.postMessage({
        type: 'done',
        blob,
        videoIndex: currentVideoIndex,
      });
    } catch (err: any) {
      log(`STOP error: ${err.message}`);
      cleanupEncoder('stop error');
      muxer = null;
      startTime = null;
      self.postMessage({
        type: 'done',
        blob: new Blob([], { type: 'video/webm' }),
        videoIndex: currentVideoIndex,
      });
      self.postMessage({ type: 'error', message: err.message });
    }
  }
};
