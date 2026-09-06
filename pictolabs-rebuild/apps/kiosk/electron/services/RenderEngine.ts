import { ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import sharp, { Sharp, OverlayOptions } from 'sharp';

/**
 * RenderEngine — 300 DPI composite image renderer using Sharp.
 *
 * Takes captured photos, applies optional filter, composites onto
 * a frame template, and outputs a print-ready JPEG.
 *
 * Supported layouts:
 * - 2R (2 photos, 2x1 grid)
 * - 4R (4 photos, 2x2 grid)
 * - 6R (6 photos, 3x2 grid)
 */

interface FrameConfig {
  id: string;
  name: string;
  /** Output canvas width in pixels (300 DPI) */
  width: number;
  /** Output canvas height in pixels (300 DPI) */
  height: number;
  /** Photo slot positions and sizes */
  slots: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  /** Optional overlay frame PNG path (transparent PNG) */
  overlayPath?: string;
}

// Default frame configs — 4x6 inch print at 300 DPI = 1200x1800px
const DEFAULT_FRAMES: Record<string, FrameConfig> = {
  '2R': {
    id: '2R',
    name: '2R Photostrip (Dual 3-Pose Strip)',
    width: 1200,
    height: 1800,
    slots: [
      // Left Strip (3 poses)
      { x: 50, y: 60, width: 500, height: 375 },
      { x: 50, y: 480, width: 500, height: 375 },
      { x: 50, y: 900, width: 500, height: 375 },
      // Right Strip (Identical duplicated 3 poses for 2-inch cut)
      { x: 650, y: 60, width: 500, height: 375 },
      { x: 650, y: 480, width: 500, height: 375 },
      { x: 650, y: 900, width: 500, height: 375 },
    ],
  },
  '4R': {
    id: '4R',
    name: '4 Grid',
    width: 1200,
    height: 1800,
    slots: [
      { x: 50, y: 50, width: 525, height: 400 },
      { x: 625, y: 50, width: 525, height: 400 },
      { x: 50, y: 500, width: 525, height: 400 },
      { x: 625, y: 500, width: 525, height: 400 },
    ],
  },
  '6R': {
    id: '6R',
    name: '6 Grid',
    width: 1200,
    height: 1800,
    slots: [
      { x: 50, y: 50, width: 350, height: 265 },
      { x: 425, y: 50, width: 350, height: 265 },
      { x: 800, y: 50, width: 350, height: 265 },
      { x: 50, y: 365, width: 350, height: 265 },
      { x: 425, y: 365, width: 350, height: 265 },
      { x: 800, y: 365, width: 350, height: 265 },
    ],
  },
};

// Simple CSS-filter-like operations via Sharp
const FILTER_PRESETS: Record<string, (img: Sharp) => Sharp> = {
  none: (img) => img,
  grayscale: (img) => img.grayscale(),
  sepia: (img) =>
    img.tint({ r: 112, g: 66, b: 20 }),
  warm: (img) =>
    img.modulate({ saturation: 1.2 }).tint({ r: 255, g: 200, b: 150 }),
  cool: (img) =>
    img.modulate({ saturation: 0.9 }).tint({ r: 150, g: 200, b: 255 }),
  vivid: (img) =>
    img.modulate({ saturation: 1.5, brightness: 1.05 }),
  bw_high_contrast: (img) =>
    img.grayscale().linear(1.4, -30),
};

interface RenderEngineConfig {
  outputDir: string;
  framesDir: string; // directory containing frame overlay PNGs
}

export interface RenderCompositeResult {
  dataUrl: string;
  filePath: string;
}

async function compositePhotos(
  photoPaths: string[],
  frameId: string,
  filterName: string,
  config: RenderEngineConfig
): Promise<RenderCompositeResult> {
  const frameConfig = DEFAULT_FRAMES[frameId] || DEFAULT_FRAMES['4R'];
  const { width, height, slots } = frameConfig;

  // Determine background color based on frame design theme
  let bg = { r: 255, g: 255, b: 255, alpha: 1 };
  let textColor = '#0f172a';
  if (frameId.includes('noir') || frameId.includes('black')) {
    bg = { r: 9, g: 13, b: 22, alpha: 1 };
    textColor = '#f8fafc';
  } else if (frameId.includes('pastel') || frameId.includes('lilac')) {
    bg = { r: 243, g: 232, b: 255, alpha: 1 };
    textColor = '#581c87';
  } else if (frameId.includes('sakura')) {
    bg = { r: 253, g: 242, b: 248, alpha: 1 };
    textColor = '#831843';
  } else if (frameId.includes('neon') || frameId.includes('cyber')) {
    bg = { r: 13, g: 6, b: 20, alpha: 1 };
    textColor = '#38bdf8';
  }

  // Create canvas with frame theme background
  let canvas = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: bg,
    },
  }).png();

  // Prepare photo composites
  const compositeInputs: OverlayOptions[] = [];

  // Loop through slots (supports 3-photo poses duplicated to dual 2R strips via modulo)
  for (let i = 0; i < slots.length && photoPaths.length > 0; i++) {
    const slot = slots[i];
    const photoPath = photoPaths[i % photoPaths.length];

    let rawBuffer: Buffer | null = null;
    if (photoPath.startsWith('data:image')) {
      const base64Data = photoPath.replace(/^data:image\/\w+;base64,/, '');
      rawBuffer = Buffer.from(base64Data, 'base64');
    } else {
      const cleanPath = photoPath.replace(/^file:\/\/\/?/, '');
      if (fs.existsSync(cleanPath)) {
        rawBuffer = fs.readFileSync(cleanPath);
      } else {
        console.warn(`[RenderEngine] Photo not found: ${cleanPath}`);
      }
    }

    if (!rawBuffer) continue;

    // Apply filter
    const applyFilter = FILTER_PRESETS[filterName] || FILTER_PRESETS.none;
    const photoBuffer = await applyFilter(sharp(rawBuffer))
      .resize(slot.width, slot.height, { fit: 'cover', position: 'center' })
      .png()
      .toBuffer();

    compositeInputs.push({
      input: photoBuffer,
      left: slot.x,
      top: slot.y,
    });
  }

  // Add decorative branding typography for 2R photostrips
  if (frameId === '2R' || slots.length === 6) {
    const brandingSvg = `
      <svg width="${width}" height="${height}">
        <!-- Subtle center cut guide mark -->
        <line x1="600" y1="20" x2="600" y2="1780" stroke="${textColor}" stroke-opacity="0.15" stroke-width="2" stroke-dasharray="8,8" />
        
        <!-- Left strip footer -->
        <text x="300" y="1450" font-family="Arial, sans-serif" font-weight="900" font-size="28" fill="${textColor}" text-anchor="middle" letter-spacing="4">PICTOLABS STUDIO</text>
        <text x="300" y="1490" font-family="Arial, sans-serif" font-weight="600" font-size="16" fill="${textColor}" fill-opacity="0.65" text-anchor="middle" letter-spacing="2">PHOTOSTRIP 2R • 300 DPI</text>

        <!-- Right strip footer -->
        <text x="900" y="1450" font-family="Arial, sans-serif" font-weight="900" font-size="28" fill="${textColor}" text-anchor="middle" letter-spacing="4">PICTOLABS STUDIO</text>
        <text x="900" y="1490" font-family="Arial, sans-serif" font-weight="600" font-size="16" fill="${textColor}" fill-opacity="0.65" text-anchor="middle" letter-spacing="2">PHOTOSTRIP 2R • 300 DPI</text>
      </svg>
    `;
    compositeInputs.push({
      input: Buffer.from(brandingSvg),
      left: 0,
      top: 0,
    });
  }

  // Check for custom frame overlay
  const overlayPath = path.join(config.framesDir, `${frameId}.png`);
  if (fs.existsSync(overlayPath)) {
    const overlayBuffer = await sharp(overlayPath)
      .resize(width, height, { fit: 'contain' })
      .png()
      .toBuffer();

    compositeInputs.push({ input: overlayBuffer, left: 0, top: 0 });
  }

  // Composite all layers
  const outputFilename = `composite_${Date.now()}.jpg`;
  const outputPath = path.join(config.outputDir, outputFilename);

  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  const outputBuffer = await canvas
    .composite(compositeInputs)
    .jpeg({
      quality: 95,
      chromaSubsampling: '4:4:4', // Best quality for printing
    })
    .withMetadata({ density: 300 }) // 300 DPI
    .toBuffer();

  fs.writeFileSync(outputPath, outputBuffer);

  console.log(`[RenderEngine] Composite saved: ${outputPath} (${width}x${height} @300DPI)`);
  
  // Return base64 data URI for safe rendering in preview, plus absolute filePath for SQLite/upload pipeline
  const base64Composite = outputBuffer.toString('base64');
  return {
    dataUrl: `data:image/jpeg;base64,${base64Composite}`,
    filePath: outputPath,
  };
}

export function registerRenderHandlers(config: RenderEngineConfig): void {
  ipcMain.handle(
    'render:composite',
    async (_event, photos: string[], frameId: string, filter: string) => {
      return compositePhotos(photos, frameId, filter, config);
    }
  );
}
