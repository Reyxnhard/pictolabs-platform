import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const sharp = require('../node_modules/sharp');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const width = 1200;
const height = 1800;
const pxPerMm = 300 / 25.4; // ~11.811 px per mm

// Build millimeter ticks for horizontal rulers (0 to 101.6 mm)
let hTicks = '';
for (let mm = 0; mm <= 101; mm++) {
  const x = Math.round(mm * pxPerMm);
  const is10 = mm % 10 === 0;
  const is5 = mm % 5 === 0;
  const tickLen = is10 ? 30 : is5 ? 20 : 10;

  // Top ruler
  hTicks += `<line x1="${x}" y1="0" x2="${x}" y2="${tickLen}" stroke="#0f172a" stroke-width="${is10 ? 2 : 1}" />`;
  if (is10 && mm > 0 && mm < 100) {
    hTicks += `<text x="${x}" y="${tickLen + 14}" font-size="12" font-family="monospace" font-weight="bold" fill="#0f172a" text-anchor="middle">${mm}</text>`;
  }

  // Bottom ruler
  hTicks += `<line x1="${x}" y1="${height}" x2="${x}" y2="${height - tickLen}" stroke="#0f172a" stroke-width="${is10 ? 2 : 1}" />`;
  if (is10 && mm > 0 && mm < 100) {
    hTicks += `<text x="${x}" y="${height - tickLen - 6}" font-size="12" font-family="monospace" font-weight="bold" fill="#0f172a" text-anchor="middle">${mm}</text>`;
  }
}

// Build millimeter ticks for vertical rulers (0 to 152.4 mm)
let vTicks = '';
for (let mm = 0; mm <= 152; mm++) {
  const y = Math.round(mm * pxPerMm);
  const is10 = mm % 10 === 0;
  const is5 = mm % 5 === 0;
  const tickLen = is10 ? 30 : is5 ? 20 : 10;

  // Left ruler
  vTicks += `<line x1="0" y1="${y}" x2="${tickLen}" y2="${y}" stroke="#0f172a" stroke-width="${is10 ? 2 : 1}" />`;
  if (is10 && mm > 0 && mm < 150) {
    vTicks += `<text x="${tickLen + 4}" y="${y + 4}" font-size="11" font-family="monospace" font-weight="bold" fill="#0f172a">${mm}</text>`;
  }

  // Right ruler
  vTicks += `<line x1="${width}" y1="${y}" x2="${width - tickLen}" y2="${y}" stroke="#0f172a" stroke-width="${is10 ? 2 : 1}" />`;
  if (is10 && mm > 0 && mm < 150) {
    vTicks += `<text x="${width - tickLen - 6}" y="${y + 4}" font-size="11" font-family="monospace" font-weight="bold" fill="#0f172a" text-anchor="end">${mm}</text>`;
  }
}

// Check square: 50.0 mm x 50.0 mm = (50 * pxPerMm) px
const checkSize = Math.round(50 * pxPerMm); // ~591 px
const checkX = Math.round((width - checkSize) / 2);
const checkY = 1000;

const svg = `
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <!-- Clean white background -->
  <rect width="${width}" height="${height}" fill="#ffffff" />

  <!-- Outer perimeter bleed reference lines (0mm, 1mm, 2mm, 3mm) -->
  <rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#dc2626" stroke-width="4" />
  <rect x="12" y="12" width="${width - 24}" height="${height - 24}" fill="none" stroke="#0f172a" stroke-width="1" stroke-dasharray="4,4" />
  <rect x="24" y="24" width="${width - 48}" height="${height - 48}" fill="none" stroke="#2563eb" stroke-width="1" />
  <rect x="35" y="35" width="${width - 70}" height="${height - 70}" fill="none" stroke="#0f172a" stroke-width="1" stroke-dasharray="2,2" />

  <!-- Corner registration L-marks -->
  <g stroke="#0f172a" stroke-width="3" fill="none">
    <!-- Top-Left -->
    <path d="M 60 40 L 40 40 L 40 60" />
    <!-- Top-Right -->
    <path d="M ${width - 60} 40 L ${width - 40} 40 L ${width - 40} 60" />
    <!-- Bottom-Left -->
    <path d="M 60 ${height - 40} L 40 ${height - 40} L 40 ${height - 60}" />
    <!-- Bottom-Right -->
    <path d="M ${width - 60} ${height - 40} L ${width - 40} ${height - 40} L ${width - 40} ${height - 60}" />
  </g>

  <!-- Rulers -->
  ${hTicks}
  ${vTicks}

  <!-- Center Cut Line (50.8 mm / 2.0 inch = 600 px) -->
  <line x1="600" y1="0" x2="600" y2="${height}" stroke="#dc2626" stroke-width="3" stroke-dasharray="16,8" />
  <rect x="585" y="60" width="30" height="26" fill="#dc2626" rx="4" />
  <text x="600" y="78" font-size="16" font-family="sans-serif" font-weight="bold" fill="#ffffff" text-anchor="middle">✂</text>
  <rect x="585" y="${height - 86}" width="30" height="26" fill="#dc2626" rx="4" />
  <text x="600" y="${height - 68}" font-size="16" font-family="sans-serif" font-weight="bold" fill="#ffffff" text-anchor="middle">✂</text>

  <!-- Vertical Cut Line Labels -->
  <g transform="translate(585, 450) rotate(-90)">
    <text x="0" y="0" font-size="14" font-family="monospace" font-weight="bold" fill="#dc2626" letter-spacing="2">
      ◄ 2-INCH PHOTOSTRIP CUT LINE (50.8 mm) ►
    </text>
  </g>
  <g transform="translate(585, 1450) rotate(-90)">
    <text x="0" y="0" font-size="14" font-family="monospace" font-weight="bold" fill="#dc2626" letter-spacing="2">
      ◄ 2-INCH PHOTOSTRIP CUT LINE (50.8 mm) ►
    </text>
  </g>

  <!-- Strip Identifiers -->
  <text x="300" y="120" font-size="22" font-family="sans-serif" font-weight="900" fill="#1e293b" text-anchor="middle">
    PHOTOSTRIP 1 (2x6 INCH)
  </text>
  <text x="300" y="145" font-size="13" font-family="monospace" fill="#64748b" text-anchor="middle">
    Width: 50.8 mm | Height: 152.4 mm
  </text>

  <text x="900" y="120" font-size="22" font-family="sans-serif" font-weight="900" fill="#1e293b" text-anchor="middle">
    PHOTOSTRIP 2 (2x6 INCH)
  </text>
  <text x="900" y="145" font-size="13" font-family="monospace" fill="#64748b" text-anchor="middle">
    Width: 50.8 mm | Height: 152.4 mm
  </text>

  <!-- Center Alignment Rings & Crosshair at (600, 900) -->
  <circle cx="600" cy="900" r="${Math.round(25 * pxPerMm)}" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-dasharray="6,6" />
  <circle cx="600" cy="900" r="${Math.round(15 * pxPerMm)}" fill="none" stroke="#2563eb" stroke-width="2" />
  <circle cx="600" cy="900" r="6" fill="#dc2626" />
  <line x1="520" y1="900" x2="680" y2="900" stroke="#2563eb" stroke-width="2" />
  <line x1="600" y1="820" x2="600" y2="980" stroke="#2563eb" stroke-width="2" />
  <text x="600" y="805" font-size="13" font-family="monospace" font-weight="bold" fill="#2563eb" text-anchor="middle">
    CENTER (X: 0, Y: 0)
  </text>

  <!-- Branding & Metadata Card -->
  <rect x="150" y="200" width="900" height="180" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2" rx="12" />
  <text x="600" y="245" font-size="24" font-family="sans-serif" font-weight="900" fill="#0f172a" text-anchor="middle" letter-spacing="1">
    PICTOLABS HARDWARE CALIBRATION TARGET
  </text>
  <text x="600" y="278" font-size="14" font-family="sans-serif" font-weight="600" fill="#2563eb" text-anchor="middle">
    BOOTH #1 OFFICIAL PRINTER CALIBRATION &amp; CUT VERIFICATION SHEET
  </text>
  <line x1="200" y1="295" x2="1000" y2="295" stroke="#e2e8f0" stroke-width="1.5" />
  <text x="600" y="322" font-size="12" font-family="monospace" fill="#475569" text-anchor="middle">
    Resolution: 1200 x 1800 px (300 DPI) | Target Size: 4x6 Inch (101.6 x 152.4 mm)
  </text>
  <text x="600" y="345" font-size="12" font-family="monospace" font-weight="bold" fill="#0f172a" text-anchor="middle">
    Kontrak Offset: 1 Unit = 0.254 mm (1/100 Inci) | Rentang: Skala 85-100%, Offset ±15
  </text>

  <!-- 50 mm Physical Ruler Verification Box -->
  <rect x="${checkX}" y="${checkY}" width="${checkSize}" height="${checkSize}" fill="#ffffff" stroke="#0f172a" stroke-width="3" />
  <rect x="${checkX + 12}" y="${checkY + 12}" width="${checkSize - 24}" height="${checkSize - 24}" fill="#f1f5f9" stroke="#94a3b8" stroke-width="1" stroke-dasharray="6,6" />
  <!-- Diagonal Cross in Box -->
  <line x1="${checkX}" y1="${checkY}" x2="${checkX + checkSize}" y2="${checkY + checkSize}" stroke="#cbd5e1" stroke-width="1.5" />
  <line x1="${checkX}" y1="${checkY + checkSize}" x2="${checkX + checkSize}" y2="${checkY}" stroke="#cbd5e1" stroke-width="1.5" />

  <text x="600" y="${checkY + 80}" font-size="18" font-family="sans-serif" font-weight="900" fill="#0f172a" text-anchor="middle">
    KOTAK UJI UKUR FISIK (RULER CHECK)
  </text>
  <text x="600" y="${checkY + 115}" font-size="28" font-family="monospace" font-weight="900" fill="#2563eb" text-anchor="middle">
    50.0 mm x 50.0 mm
  </text>
  <text x="600" y="${checkY + 155}" font-size="13" font-family="sans-serif" fill="#475569" text-anchor="middle">
    Ukur kotak ini dengan penggaris fisik setelah dicetak.
  </text>
  <text x="600" y="${checkY + 180}" font-size="13" font-family="sans-serif" font-weight="bold" fill="#0f172a" text-anchor="middle">
    Jika ukuran tepat 50.0 mm, skala printer berada pada 100% presisi.
  </text>

  <!-- Instructions at bottom -->
  <rect x="150" y="${height - 240}" width="900" height="120" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.5" rx="10" />
  <text x="600" y="${height - 205}" font-size="14" font-family="sans-serif" font-weight="bold" fill="#0f172a" text-anchor="middle">
    PETUNJUK EVALUASI KALIBRASI OPERATOR
  </text>
  <text x="600" y="${height - 175}" font-size="12" font-family="sans-serif" fill="#475569" text-anchor="middle">
    1. Garis potong tengah merah harus tepat berada di antara 2 strip tanpa memotong konten foto.
  </text>
  <text x="600" y="${height - 150}" font-size="12" font-family="sans-serif" fill="#475569" text-anchor="middle">
    2. Jika garis potong bergeser ke kiri, naikkan Offset X (+). Jika bergeser ke kanan, turunkan Offset X (-).
  </text>
  <text x="600" y="${height - 128}" font-size="12" font-family="sans-serif" fill="#475569" text-anchor="middle">
    3. Jika terdapat tepi putih di atas/bawah, sesuaikan Skala (%) atau Offset Y (±).
  </text>
</svg>
`;

async function generate() {
  const assetsDir = path.resolve(__dirname, '../apps/kiosk/resources/assets');
  if (!fs.existsSync(assetsDir)) {
    fs.mkdirSync(assetsDir, { recursive: true });
  }

  const outputPath = path.join(assetsDir, 'calibration_target.png');
  console.log(`Generating official Pictolabs calibration target to: ${outputPath}...`);

  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  const stats = fs.statSync(outputPath);
  console.log(`✓ Successfully generated calibration_target.png (${stats.size} bytes, ${width}x${height} px at 300 DPI)`);
}

generate().catch((err) => {
  console.error('Failed to generate calibration target:', err);
  process.exit(1);
});
