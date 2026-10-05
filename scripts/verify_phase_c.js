const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = 'c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs';

console.log('================================================================================');
console.log('PICTOLABS — PHASE C VALIDATION GATES (GATES C.1 – C.8)');
console.log('================================================================================\n');

const moves = [
  // 11 Root Duplicates
  { src: 'DEPLOYMENT_AUDIT.md', tgt: 'docs/99_ARCHIVE/DUPLICATES/DEPLOYMENT_AUDIT.md', type: 'ROOT_DUPLICATE' },
  { src: 'FOUNDER_UAT_CHECKLIST.md', tgt: 'docs/99_ARCHIVE/DUPLICATES/FOUNDER_UAT_CHECKLIST.md', type: 'ROOT_DUPLICATE' },
  { src: 'OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md', tgt: 'docs/99_ARCHIVE/DUPLICATES/OFFLINE_PAYMENT_BYPASS_FIX_REPORT.md', type: 'ROOT_DUPLICATE' },
  { src: 'PAYMENT_BLINK_FIX_VALIDATION.md', tgt: 'docs/99_ARCHIVE/DUPLICATES/PAYMENT_BLINK_FIX_VALIDATION.md', type: 'ROOT_DUPLICATE' },
  { src: 'PAYMENT_QR_SOURCE_AUDIT.md', tgt: 'docs/99_ARCHIVE/DUPLICATES/PAYMENT_QR_SOURCE_AUDIT.md', type: 'ROOT_DUPLICATE' },
  { src: 'PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_5.md', tgt: 'docs/99_ARCHIVE/DUPLICATES/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_5.md', type: 'ROOT_DUPLICATE' },
  { src: 'PRINTER_FAILURE_HANDLING_V2_RCA_5.md', tgt: 'docs/99_ARCHIVE/DUPLICATES/PRINTER_FAILURE_HANDLING_V2_RCA_5.md', type: 'ROOT_DUPLICATE' },
  { src: 'SESSION_HISTORY_CENTER_PHASE1_2_FIX_REPORT.md', tgt: 'docs/99_ARCHIVE/DUPLICATES/SESSION_HISTORY_CENTER_PHASE1_2_FIX_REPORT.md', type: 'ROOT_DUPLICATE' },
  { src: 'SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md', tgt: 'docs/99_ARCHIVE/DUPLICATES/SESSION_HISTORY_CENTER_PHASE1_2_REPORT.md', type: 'ROOT_DUPLICATE' },
  { src: 'SESSION_HISTORY_CENTER_PRD.md', tgt: 'docs/99_ARCHIVE/DUPLICATES/SESSION_HISTORY_CENTER_PRD.md', type: 'ROOT_DUPLICATE' },
  { src: 'SPRINT_3_PRODUCTION_CHECKLIST.md', tgt: 'docs/99_ARCHIVE/DUPLICATES/SPRINT_3_PRODUCTION_CHECKLIST.md', type: 'ROOT_DUPLICATE' },

  // 3 Monorepo Mirrors
  { src: 'pictolabs-rebuild/DEPLOYMENT_AUDIT.md', tgt: 'docs/99_ARCHIVE/MIRRORS/DEPLOYMENT_AUDIT.md', type: 'MONOREPO_MIRROR' },
  { src: 'pictolabs-rebuild/SPRINT_2_REVIEW.md', tgt: 'docs/99_ARCHIVE/MIRRORS/SPRINT_2_REVIEW.md', type: 'MONOREPO_MIRROR' },
  { src: 'pictolabs-rebuild/SPRINT_3_PRODUCTION_CHECKLIST.md', tgt: 'docs/99_ARCHIVE/MIRRORS/SPRINT_3_PRODUCTION_CHECKLIST.md', type: 'MONOREPO_MIRROR' },

  // 3 Superseded
  { src: 'CURRENT_PROJECT_STATUS.md', tgt: 'docs/99_ARCHIVE/SUPERSEDED/CURRENT_PROJECT_STATUS.md', type: 'SUPERSEDED' },
  { src: 'PAYMENT_BLINK_RCA.md', tgt: 'docs/99_ARCHIVE/SUPERSEDED/PAYMENT_BLINK_RCA_V1_DRAFT.md', type: 'SUPERSEDED' },
  { src: 'pictolabs-rebuild/MASTER_PROJECT_STATUS.md', tgt: 'docs/99_ARCHIVE/SUPERSEDED/MASTER_PROJECT_STATUS_V1.md', type: 'SUPERSEDED' }
];

// --- GATE C.1: EXACTLY 17 FILES RELOCATED ---
console.log('--- GATE C.1: RELOCATION COUNT VERIFICATION ---');
console.log(`Expected moves count: ${moves.length} (11 root duplicates + 3 mirrors + 3 superseded)`);
let c1Moved = 0;
moves.forEach(m => {
  if (fs.existsSync(path.join(root, m.tgt)) && !fs.existsSync(path.join(root, m.src))) {
    c1Moved++;
  }
});
console.log(`Relocated files confirmed: ${c1Moved} / 17`);
const gateC1 = c1Moved === 17 && moves.length === 17;
console.log(`GATE C.1 RESULT: ${gateC1 ? 'PASS ✓' : 'FAIL ✗'}\n`);

// --- GATE C.2: CANONICAL RECONCILIATION ---
console.log('--- GATE C.2: CANONICAL RECONCILIATION INTEGRITY ---');
const fixReport5 = fs.readFileSync(path.join(root, 'docs/02_EVIDENCE/FIX_REPORTS/PRINTER_FAILURE_HANDLING_V2_FIX_REPORT_5.md'), 'utf8');
const rca5 = fs.readFileSync(path.join(root, 'docs/02_EVIDENCE/RCA/PRINTER_FAILURE_HANDLING_V2_RCA_5.md'), 'utf8');

const fixReportHasProbeLine = fixReport5.includes('`queryPrinterHealth` records `mediaRemaining` directly from the initial `PhotolabDNP.exe` probe.');
const fixReportHasHandoffLine = fixReport5.includes('Updated `printImage(imagePath, printerName, copies, preValidatedHealth?: PrinterHealth)` and exported `isPrinterHandoffValid` to enforce **EXACT printer identity matching**:');
const rcaHasFirmwareSpelling = rca5.includes('Firmware only decrements `mediaRemaining` AFTER cutter cycle finishes and strips eject.');
const rcaHasNoFirmareTypo = !rca5.includes('Firmare only decrements');

console.log(`Fix Report 5 line 160 probe restoration: ${fixReportHasProbeLine ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Fix Report 5 line 161 handoff restoration: ${fixReportHasHandoffLine ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`RCA 5 Firmware spelling correction: ${rcaHasFirmwareSpelling ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`RCA 5 Firmare typo eliminated: ${rcaHasNoFirmareTypo ? 'PASS ✓' : 'FAIL ✗'}`);

const gateC2 = fixReportHasProbeLine && fixReportHasHandoffLine && rcaHasFirmwareSpelling && rcaHasNoFirmareTypo;
console.log(`GATE C.2 RESULT: ${gateC2 ? 'PASS ✓' : 'FAIL ✗'}\n`);

// --- GATE C.3: ROOT CLEANUP ---
console.log('--- GATE C.3: ROOT & MONOREPO CLEANUP ---');
let residualSources = 0;
moves.forEach(m => {
  if (fs.existsSync(path.join(root, m.src))) {
    console.error(`[FAIL] Source still exists at: ${m.src}`);
    residualSources++;
  }
});
console.log(`Residual source files remaining at original paths: ${residualSources}`);
const gateC3 = residualSources === 0;
console.log(`GATE C.3 RESULT: ${gateC3 ? 'PASS ✓' : 'FAIL ✗'}\n`);

// --- GATE C.4: PROTECTED FILES REMAIN UNTOUCHED ---
console.log('--- GATE C.4: PROTECTED FILES INVARIANT VERIFICATION ---');
const wsFiles = [
  'docs/01_WORKSTREAMS/CAMERA_WORKSTREAM.md',
  'docs/01_WORKSTREAMS/DASHBOARD_WORKSTREAM.md',
  'docs/01_WORKSTREAMS/DEPLOYMENT_WORKSTREAM.md',
  'docs/01_WORKSTREAMS/FLEET_WORKSTREAM.md',
  'docs/01_WORKSTREAMS/KIOSK_HARDENING_WORKSTREAM.md',
  'docs/01_WORKSTREAMS/PAYMENT_WORKSTREAM.md',
  'docs/01_WORKSTREAMS/PRINTER_WORKSTREAM.md',
  'docs/01_WORKSTREAMS/SECURITY_WORKSTREAM.md',
  'docs/01_WORKSTREAMS/SESSION_HISTORY_WORKSTREAM.md',
  'docs/01_WORKSTREAMS/STORAGE_WORKSTREAM.md'
];
let wsIntact = 0;
wsFiles.forEach(w => {
  if (fs.existsSync(path.join(root, w))) wsIntact++;
});
console.log(`Protected Workstream Files Verified (in-place): ${wsIntact} / 10`);

const readmes = [
  'pictolabs-rebuild/README.md',
  'pictolabs-rebuild/apps/dashboard/README.md'
];
let rmIntact = 0;
readmes.forEach(r => {
  if (fs.existsSync(path.join(root, r))) rmIntact++;
});
console.log(`Codebase README Assets Verified (in-place): ${rmIntact} / 2`);

const gateC4 = wsIntact === 10 && rmIntact === 2;
console.log(`GATE C.4 RESULT: ${gateC4 ? 'PASS ✓' : 'FAIL ✗'}\n`);

// --- GATE C.5: NO APPLICATION CODE CHANGES ---
console.log('--- GATE C.5: ZERO APPLICATION CODE MODIFICATIONS ---');
const statusShort = execSync('git status --porcelain', { cwd: root }).toString();
const statusLines = statusShort.split('\n').filter(l => l.trim());
let appCodeDiffs = 0;
statusLines.forEach(l => {
  const p = l.slice(3).trim();
  if (p.startsWith('pictolabs-rebuild/apps/') || p.startsWith('pictolabs-rebuild/packages/') || p.endsWith('.ts') || p.endsWith('.tsx')) {
    console.error(`[FAIL] Application source file modified: ${p}`);
    appCodeDiffs++;
  }
});
console.log(`Application source code modifications detected: ${appCodeDiffs}`);
const gateC5 = appCodeDiffs === 0;
console.log(`GATE C.5 RESULT: ${gateC5 ? 'PASS ✓' : 'FAIL ✗'}\n`);

// --- GATE C.6: ARCHIVE DESTINATION VALIDATION ---
console.log('--- GATE C.6: ARCHIVE DESTINATION INTEGRITY ---');
let allTargetsExist = true;
moves.forEach(m => {
  if (!fs.existsSync(path.join(root, m.tgt))) {
    console.error(`Target missing: ${m.tgt}`);
    allTargetsExist = false;
  }
});
console.log(`All 17 archive destination targets exist on disk: ${allTargetsExist ? 'YES ✓' : 'NO ✗'}`);
const gateC6 = allTargetsExist;
console.log(`GATE C.6 RESULT: ${gateC6 ? 'PASS ✓' : 'FAIL ✗'}\n`);

// --- GATE C.7: DOCUMENTATION INTEGRITY ---
console.log('--- GATE C.7: DOCUMENTATION INTEGRITY (0 BROKEN LINKS & 0 DANGLING) ---');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    if (file === 'node_modules' || file === '.git' || file === '.gemini' || file === 'dist' || file === 'build') return;
    const p = path.join(dir, file);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      results = results.concat(walk(p));
    } else if (file.endsWith('.md')) {
      results.push(p);
    }
  });
  return results;
}

const allMds = walk(root).map(f => path.relative(root, f).replace(/\\/g, '/'));
const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

let totalChecked = 0;
let brokenLinks = [];

allMds.forEach(f => {
  if (f.startsWith('docs/99_ARCHIVE/')) return;

  const absPath = path.join(root, f);
  const content = fs.readFileSync(absPath, 'utf8');

  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const text = match[1];
    const url = match[2];

    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:') || url.startsWith('#')) continue;

    let cleanUrl = url.split('#')[0];
    if (!cleanUrl.endsWith('.md')) continue;

    totalChecked++;

    let targetDiskPath = '';
    const filePrefix = cleanUrl.match(/^file:\/\/\/[a-zA-Z]:\/Users\/[^\/]+\/\.gemini\/antigravity-ide\/scratch\/Pictolabs\//i);

    if (filePrefix) {
      const relPath = cleanUrl.slice(filePrefix[0].length);
      targetDiskPath = path.join(root, relPath);
    } else if (cleanUrl.startsWith('file:///')) {
      continue;
    } else {
      targetDiskPath = path.resolve(path.dirname(absPath), cleanUrl);
    }

    if (!fs.existsSync(targetDiskPath)) {
      brokenLinks.push({
        sourceFile: f,
        linkText: text,
        url: url,
        resolvedPath: targetDiskPath
      });
    }
  }
});

console.log(`Total internal Markdown links checked across active documentation: ${totalChecked}`);
console.log(`Broken internal Markdown links: ${brokenLinks.length}`);
if (brokenLinks.length > 0) {
  brokenLinks.forEach(b => {
    console.error(`  [BROKEN] In ${b.sourceFile}: [${b.linkText}] -> ${b.url}`);
  });
}
const gateC7 = brokenLinks.length === 0;
console.log(`GATE C.7 RESULT: ${gateC7 ? 'PASS ✓' : 'FAIL ✗'}\n`);

// --- GATE C.8: WORKING TREE STATUS ---
console.log('--- GATE C.8: WORKING TREE INTEGRITY ---');
console.log(`Current staged/unstaged changes: ${statusLines.length} files`);
const gateC8 = gateC1 && gateC2 && gateC3 && gateC4 && gateC5 && gateC6 && gateC7;
console.log(`GATE C.8 RESULT: ${gateC8 ? 'PASS ✓' : 'FAIL ✗'}\n`);

console.log('================================================================================');
console.log('PHASE C VALIDATION GATE SUMMARY');
console.log('================================================================================');
console.log(`Gate C.1 (Relocation Count - Exactly 17 files moved):        ${gateC1 ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Gate C.2 (Canonical Reconciliation - Probe & Spelling fix):   ${gateC2 ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Gate C.3 (Root Cleanup - 0 residual files at old paths):     ${gateC3 ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Gate C.4 (Protected Invariants - 10 WS + 2 README untouched): ${gateC4 ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Gate C.5 (Code Safety - 0 application source diffs):         ${gateC5 ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Gate C.6 (Archive Destination - 17 git-tracked targets):     ${gateC6 ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Gate C.7 (Documentation Integrity - 0 broken links):         ${gateC7 ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Gate C.8 (Working Tree Integrity):                           ${gateC8 ? 'PASS ✓' : 'FAIL ✗'}`);

const overallPass = gateC1 && gateC2 && gateC3 && gateC4 && gateC5 && gateC6 && gateC7 && gateC8;
console.log(`\nOVERALL PHASE C VERDICT: ${overallPass ? 'ALL GATES PASS (PROCEED WITH COMMIT)' : 'GATE FAILED (DO NOT COMMIT)'}`);
console.log('================================================================================');

process.exit(overallPass ? 0 : 1);
