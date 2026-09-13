import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface LivePhotoConfig {
  dataDir: string;
  videosDir: string;
}

let serviceConfig: LivePhotoConfig;

/**
 * Locate bundled or workspace ffmpeg.exe binary.
 */
export function findFfmpegPath(): string | null {
  const candidates = [
    // 1. Photolab reverse-engineering template directory in workspace
    path.resolve(__dirname, '../../../../kiosk-client-photobooth-template-flipbook-basic/ffmpeg.exe'),
    path.resolve(process.cwd(), '../kiosk-client-photobooth-template-flipbook-basic/ffmpeg.exe'),
    path.resolve(process.cwd(), '../../kiosk-client-photobooth-template-flipbook-basic/ffmpeg.exe'),
    'c:\\Users\\ezarh\\.gemini\\antigravity-ide\\scratch\\Pictolabs\\kiosk-client-photobooth-template-flipbook-basic\\ffmpeg.exe',
    // 2. Production packaged resources
    path.join(process.resourcesPath || '', 'ffmpeg.exe'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }

  return null;
}

/**
 * Save a single pose countdown video clip (WebM binary) and optionally convert to MP4.
 */
export async function saveLiveClip(
  sessionId: string,
  poseIndex: number,
  dataUrlOrBase64OrBuffer: string | Uint8Array | ArrayBuffer | Buffer,
  config: LivePhotoConfig = serviceConfig
): Promise<{ success: boolean; filePath: string; mp4Path?: string }> {
  if (!fs.existsSync(config.videosDir)) {
    fs.mkdirSync(config.videosDir, { recursive: true });
  }

  let buffer: Buffer;
  if (Buffer.isBuffer(dataUrlOrBase64OrBuffer)) {
    buffer = dataUrlOrBase64OrBuffer;
  } else if (dataUrlOrBase64OrBuffer instanceof Uint8Array) {
    buffer = Buffer.from(dataUrlOrBase64OrBuffer.buffer, dataUrlOrBase64OrBuffer.byteOffset, dataUrlOrBase64OrBuffer.byteLength);
  } else if (dataUrlOrBase64OrBuffer instanceof ArrayBuffer) {
    buffer = Buffer.from(dataUrlOrBase64OrBuffer);
  } else if (typeof dataUrlOrBase64OrBuffer === 'string') {
    const base64Data = dataUrlOrBase64OrBuffer.replace(/^data:video\/\w+;base64,/, '');
    buffer = Buffer.from(base64Data, 'base64');
  } else {
    buffer = Buffer.from(dataUrlOrBase64OrBuffer as any);
  }

  const webmPath = path.join(config.videosDir, `livephoto_${sessionId}_pose_${poseIndex}.webm`);
  fs.writeFileSync(webmPath, buffer);

  const mp4Path = path.join(config.videosDir, `livephoto_${sessionId}_pose_${poseIndex}.mp4`);
  const ffmpegPath = findFfmpegPath();

  if (ffmpegPath) {
    try {
      await execFileAsync(ffmpegPath, [
        '-y',
        '-i', webmPath,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'fast',
        '-vf', 'setsar=1',
        '-g', '30',
        '-keyint_min', '15',
        '-force_key_frames', 'expr:gte(t,n_forced*1)',
        '-b:v', '2000k',
        '-maxrate', '2500k',
        '-bufsize', '5000k',
        '-movflags', '+faststart',
        mp4Path,
      ]);
      console.log(`[LivePhotoService] ✓ Converted pose ${poseIndex} to universal MP4: ${mp4Path}`);
      // Immediate Transient Cleanup: unlink source WebM file to free disk space immediately
      if (fs.existsSync(mp4Path) && fs.statSync(mp4Path).size > 1024) {
        try {
          fs.unlinkSync(webmPath);
          console.log(`[LivePhotoService] ✓ Cleaned up transient WebM source: ${path.basename(webmPath)}`);
        } catch (_) {}
      }
      return { success: true, filePath: mp4Path, mp4Path };
    } catch (err: any) {
      console.warn(`[LivePhotoService] FFmpeg transcode warning for pose ${poseIndex}: ${err.message}`);
    }
  }

  console.log(`[LivePhotoService] Saved countdown clip: ${webmPath} (${buffer.length} bytes)`);
  return { success: true, filePath: webmPath };
}

/**
 * Finalize individual pose clips as separate Live Photos without stitching.
 * Returns an array of paths, one separate video per captured pose.
 */
export async function finalizeSessionLivePhotos(
  sessionId: string,
  totalPoses: number = 4,
  config: LivePhotoConfig = serviceConfig
): Promise<{ success: boolean; videoPaths: string[]; videoPath: string }> {
  if (!fs.existsSync(config.videosDir)) {
    fs.mkdirSync(config.videosDir, { recursive: true });
  }

  const ffmpegPath = findFfmpegPath();
  const videoPaths: string[] = [];

  for (let i = 1; i <= totalPoses; i++) {
    const mp4Path = path.join(config.videosDir, `livephoto_${sessionId}_pose_${i}.mp4`);
    const webmPath = path.join(config.videosDir, `livephoto_${sessionId}_pose_${i}.webm`);
    const legacyClipPath = path.join(config.videosDir, `clip_${sessionId}_pose_${i}.webm`);

    if (fs.existsSync(mp4Path)) {
      videoPaths.push(mp4Path);
    } else {
      const srcWebm = fs.existsSync(webmPath) ? webmPath : fs.existsSync(legacyClipPath) ? legacyClipPath : null;
      if (srcWebm) {
        if (ffmpegPath) {
          try {
            await execFileAsync(ffmpegPath, [
              '-y',
              '-i', srcWebm,
              '-c:v', 'libx264',
              '-pix_fmt', 'yuv420p',
              '-preset', 'fast',
              '-vf', 'setsar=1',
              '-g', '30',
              '-keyint_min', '15',
              '-force_key_frames', 'expr:gte(t,n_forced*1)',
              '-b:v', '2000k',
              '-maxrate', '2500k',
              '-bufsize', '5000k',
              '-movflags', '+faststart',
              mp4Path,
            ]);
            if (fs.existsSync(mp4Path) && fs.statSync(mp4Path).size > 1024) {
              try {
                fs.unlinkSync(srcWebm);
                console.log(`[LivePhotoService] ✓ Cleaned up finalized WebM: ${path.basename(srcWebm)}`);
              } catch (_) {}
            }
            videoPaths.push(mp4Path);
            continue;
          } catch (_) {}
        }
        videoPaths.push(srcWebm);
      }
    }
  }

  console.log(
    `[LivePhotoService] ✓ Finalized ${videoPaths.length} individual Live Photos for session ${sessionId}:`,
    videoPaths.map((p) => path.basename(p))
  );

  return {
    success: videoPaths.length > 0,
    videoPaths,
    videoPath: videoPaths[0] || '',
  };
}

/**
 * Clean up transient or orphaned video clips for a given session.
 */
export function cleanupSessionClips(sessionId: string, config: LivePhotoConfig = serviceConfig): void {
  if (!config?.videosDir || !fs.existsSync(config.videosDir)) return;
  try {
    const files = fs.readdirSync(config.videosDir);
    for (const f of files) {
      if (f.includes(sessionId) && (f.endsWith('.webm') || f.endsWith('.txt') || f.endsWith('.tmp'))) {
        try {
          fs.unlinkSync(path.join(config.videosDir, f));
          console.log(`[LivePhotoService] Cleaned up transient file: ${f}`);
        } catch (_) {}
      }
    }
  } catch (_) {}
}

/**
 * Generate animated looping GIF / MP4 slideshow from captured photos.
 */
export async function generateSessionGif(
  sessionId: string,
  photoPaths: string[],
  config: LivePhotoConfig = serviceConfig
): Promise<{ success: boolean; gifPath?: string; mp4Path?: string }> {
  if (!fs.existsSync(config.videosDir)) {
    fs.mkdirSync(config.videosDir, { recursive: true });
  }

  const ffmpegPath = findFfmpegPath();
  if (!ffmpegPath || !photoPaths || photoPaths.length === 0) {
    return { success: false };
  }

  const concatFilePath = path.join(config.videosDir, `gif_${sessionId}_concat.txt`);

  try {
    const validPhotos = photoPaths
      .map((p) => p.replace(/^file:\/\/\/?/, ''))
      .filter((p) => fs.existsSync(p));

    if (validPhotos.length === 0) {
      return { success: false };
    }

    // Build boomerang order: 0 -> 1 -> 2 -> 1
    const sequence: string[] = [];
    for (let i = 0; i < validPhotos.length; i++) {
      sequence.push(validPhotos[i]);
    }
    if (validPhotos.length > 2) {
      for (let i = validPhotos.length - 2; i > 0; i--) {
        sequence.push(validPhotos[i]);
      }
    }

    const durationPerFrame = 0.45; // 450ms per frame
    let concatContent = '';
    for (const p of sequence) {
      concatContent += `file '${p.replace(/\\/g, '/')}'\nduration ${durationPerFrame}\n`;
    }
    if (sequence.length > 0) {
      concatContent += `file '${sequence[sequence.length - 1].replace(/\\/g, '/')}'\n`;
    }
    fs.writeFileSync(concatFilePath, concatContent, 'utf-8');

    const outputMp4 = path.join(config.videosDir, `gif_${sessionId}.mp4`);
    const outputGif = path.join(config.videosDir, `gif_${sessionId}.gif`);

    await execFileAsync(ffmpegPath, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatFilePath,
      '-vf', 'scale=720:-2:flags=lanczos,fps=10',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-g', '10',
      '-movflags', '+faststart',
      outputMp4,
    ]);

    try {
      await execFileAsync(ffmpegPath, [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFilePath,
        '-vf', 'scale=480:-2:flags=lanczos,fps=8',
        outputGif,
      ]);
    } catch (_) {}

    console.log(`[LivePhotoService] ✓ Generated GIF loop for ${sessionId}: ${outputMp4}`);
    return {
      success: true,
      gifPath: fs.existsSync(outputGif) ? outputGif : outputMp4,
      mp4Path: outputMp4,
    };
  } catch (err: any) {
    console.warn(`[LivePhotoService] GIF generation warning: ${err.message}`);
    return { success: false };
  } finally {
    if (fs.existsSync(concatFilePath)) {
      try {
        fs.unlinkSync(concatFilePath);
      } catch (_) {}
    }
  }
}

/**
 * Read local video file and return base64 Data URL (e.g. data:video/mp4;base64,...).
 * Guarantees zero "Not allowed to load local resource" security blocks in Chromium.
 */
export async function getClipDataUrl(filePath: string): Promise<string | null> {
  try {
    const cleanPath = filePath.replace(/^file:\/\/\/?/, '');
    if (!fs.existsSync(cleanPath)) {
      return null;
    }
    const ext = path.extname(cleanPath).toLowerCase();
    const mime = ext === '.webm' ? 'video/webm' : 'video/mp4';
    const buffer = fs.readFileSync(cleanPath);
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch (err: any) {
    console.warn(`[LivePhotoService] Error reading clip data URL for ${filePath}: ${err.message}`);
    return null;
  }
}

/**
 * Register Electron IPC handlers for Live Photo engine.
 */
export function registerLivePhotoHandlers(config: LivePhotoConfig): void {
  serviceConfig = config;

  if (!fs.existsSync(config.videosDir)) {
    fs.mkdirSync(config.videosDir, { recursive: true });
  }

  ipcMain.handle(
    'livephoto:save-clip',
    async (_event, sessionId: string, poseIndex: number, data: string | Uint8Array | ArrayBuffer) => {
      return saveLiveClip(sessionId, poseIndex, data, config);
    }
  );

  ipcMain.handle(
    'livephoto:save-clip-buffer',
    async (_event, sessionId: string, poseIndex: number, buffer: Uint8Array | ArrayBuffer) => {
      return saveLiveClip(sessionId, poseIndex, buffer, config);
    }
  );

  ipcMain.handle(
    'livephoto:finalize',
    async (_event, sessionId: string, totalPoses: number = 4) => {
      return finalizeSessionLivePhotos(sessionId, totalPoses, config);
    }
  );

  ipcMain.handle(
    'livephoto:generate-gif',
    async (_event, sessionId: string, photoPaths: string[]) => {
      return generateSessionGif(sessionId, photoPaths, config);
    }
  );

  ipcMain.handle(
    'livephoto:get-clip-data',
    async (_event, filePath: string) => {
      return getClipDataUrl(filePath);
    }
  );

  // Backward-compatible alias
  ipcMain.handle(
    'livephoto:generate',
    async (_event, sessionId: string, totalPoses: number = 4) => {
      return finalizeSessionLivePhotos(sessionId, totalPoses, config);
    }
  );

  console.log('[LivePhotoService] ✓ Live Photo IPC handlers registered (Separate Clips, Data URL & GIF Mode)');
}
