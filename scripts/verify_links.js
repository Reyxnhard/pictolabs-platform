const fs = require('fs');
const path = require('path');

const workspaceRoot = 'c:/Users/ezarh/.gemini/antigravity-ide/scratch/Pictolabs';

console.log('================================================================================');
console.log('PICTOLABS — PHASE B LINK VALIDATION GATE (GATE 4)');
console.log('================================================================================');

// 1. Check Missing Relocation Targets (Gate 4.1)
console.log('\n--- GATE 4.1: RELOCATION TARGET VERIFICATION ---');
const reportPath = path.join(workspaceRoot, 'docs/AG_PHASE_B_FINAL_CORRECTION_REPORT.md');
const report = fs.readFileSync(reportPath, 'utf8');
const lines = report.split('\n');
let s3Start = -1, s4Start = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('## 3. Authoritative Reconciled Manifest')) s3Start = i;
  if (lines[i].includes('## 4. Reconciled Root Cause Analyses')) s4Start = i;
}
const manifestLines = lines.slice(s3Start, s4Start).filter(l => l.startsWith('|') && /^\s*\|\s*\d+\s*\|/.test(l));
const entries = manifestLines.map(l => {
  const parts = l.split('|').map(s => s.trim()).filter((s, idx, arr) => idx > 0 && idx < arr.length);
  return {
    num: parseInt(parts[0], 10),
    source: parts[1].replace(/`/g, ''),
    category: parts[2].replace(/`/g, ''),
    target: parts[3].replace(/`/g, ''),
  };
});

const relocations = entries.filter(e => e.category !== 'REVIEW_REQUIRED' && e.category !== 'CODEBASE_ASSET' && e.category !== 'WORKSTREAM_CONTEXT');
console.log(`Expected Relocations Count: ${relocations.length} (must be exactly 132)`);

let missingTargets = 0;
let residualSources = 0;

relocations.forEach(r => {
  const targetAbs = path.join(workspaceRoot, r.target);
  const sourceAbs = path.join(workspaceRoot, r.source);
  if (!fs.existsSync(targetAbs)) {
    console.error(`[FAIL] Target missing: ${r.target}`);
    missingTargets++;
  }
  if (fs.existsSync(sourceAbs) && r.source !== r.target) {
    console.error(`[FAIL] Source still exists: ${r.source}`);
    residualSources++;
  }
});

console.log(`Missing Relocation Targets: ${missingTargets}`);
console.log(`Residual Source Files: ${residualSources}`);
const gate4_1 = missingTargets === 0 && residualSources === 0 && relocations.length === 132;
console.log(`GATE 4.1 RESULT: ${gate4_1 ? 'PASS ✓' : 'FAIL ✗'}`);

// 2. Check Protected & Blocked Files (Gate 4.2)
console.log('\n--- GATE 4.2: PROTECTED & BLOCKED INVARIANT VERIFICATION ---');
const workstreams = entries.filter(e => e.category === 'WORKSTREAM_CONTEXT');
const codebase = entries.filter(e => e.category === 'CODEBASE_ASSET');
const blocked = entries.filter(e => e.category === 'REVIEW_REQUIRED');

let wsOk = 0;
workstreams.forEach(w => {
  if (fs.existsSync(path.join(workspaceRoot, w.source))) wsOk++;
});
let cbOk = 0;
codebase.forEach(c => {
  if (fs.existsSync(path.join(workspaceRoot, c.source))) cbOk++;
});
let blOk = 0;
blocked.forEach(b => {
  if (fs.existsSync(path.join(workspaceRoot, b.source))) blOk++;
});

console.log(`Protected Workstream Files Verified (in-place): ${wsOk} / 10`);
console.log(`Codebase README Assets Verified (in-place): ${cbOk} / 2`);
console.log(`Blocked REVIEW_REQUIRED Files Verified (in-place): ${blOk} / 17`);
const gate4_2 = wsOk === 10 && cbOk === 2 && blOk === 17;
console.log(`GATE 4.2 RESULT: ${gate4_2 ? 'PASS ✓' : 'FAIL ✗'}`);

// 3. Check Dangling References to Relocated Source Paths (Gate 4.3)
console.log('\n--- GATE 4.3: DANGLING REFERENCE SCAN ---');
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

const allMds = walk(workspaceRoot).map(f => path.relative(workspaceRoot, f).replace(/\\/g, '/'));
const oldSources = new Set(relocations.map(r => r.source.toLowerCase().replace(/^\.\//, '')));
const blockedSet = new Set(blocked.map(b => b.source.toLowerCase().replace(/^\.\//, '')));

let danglingRefs = [];
const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;

allMds.forEach(f => {
  // We check active canonical docs (excluding 99_ARCHIVE and excluded BLOCKED files)
  if (f.startsWith('docs/99_ARCHIVE/') || blockedSet.has(f.toLowerCase())) return;

  const content = fs.readFileSync(path.join(workspaceRoot, f), 'utf8');
  let m;
  while ((m = linkRegex.exec(content)) !== null) {
    const text = m[1];
    const url = m[2];
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:') || url.startsWith('#')) continue;

    let clean = url.split('#')[0].replace(/^file:\/\/\/[a-zA-Z]:\/Users\/[^\/]+\/\.gemini\/antigravity-ide\/scratch\/Pictolabs\//i, '').replace(/^\.\//, '');
    if (oldSources.has(clean.toLowerCase())) {
      danglingRefs.push({ file: f, linkText: text, target: clean });
    }
  }
});

console.log(`Dangling References Found in Active Documentation: ${danglingRefs.length}`);
if (danglingRefs.length > 0) {
  danglingRefs.forEach(d => console.error(`  [DANGLING] In ${d.file}: [${d.linkText}] -> ${d.target}`));
}
const gate4_3 = danglingRefs.length === 0;
console.log(`GATE 4.3 RESULT: ${gate4_3 ? 'PASS ✓' : 'FAIL ✗'}`);

// 4. Check Broken Internal Markdown Links (Gate 4.4)
console.log('\n--- GATE 4.4: BROKEN INTERNAL MARKDOWN LINK RESOLUTION ---');
let totalMdLinksChecked = 0;
let brokenMdLinks = [];

allMds.forEach(f => {
  if (f.startsWith('docs/99_ARCHIVE/') || blockedSet.has(f.toLowerCase())) return;

  const absPath = path.join(workspaceRoot, f);
  const content = fs.readFileSync(absPath, 'utf8');

  let match;
  while ((match = linkRegex.exec(content)) !== null) {
    const text = match[1];
    const url = match[2];

    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:') || url.startsWith('#')) continue;

    let cleanUrl = url.split('#')[0];
    // We validate markdown documentation links for this gate
    if (!cleanUrl.endsWith('.md')) continue;

    totalMdLinksChecked++;

    let targetDiskPath = '';
    const filePrefix = cleanUrl.match(/^file:\/\/\/[a-zA-Z]:\/Users\/[^\/]+\/\.gemini\/antigravity-ide\/scratch\/Pictolabs\//i);

    if (filePrefix) {
      const relPath = cleanUrl.slice(filePrefix[0].length);
      targetDiskPath = path.join(workspaceRoot, relPath);
    } else if (cleanUrl.startsWith('file:///')) {
      continue;
    } else {
      targetDiskPath = path.resolve(path.dirname(absPath), cleanUrl);
    }

    if (!fs.existsSync(targetDiskPath)) {
      brokenMdLinks.push({
        sourceFile: f,
        linkText: text,
        url: url,
        resolvedPath: targetDiskPath
      });
    }
  }
});

console.log(`Total Internal Markdown Links Checked: ${totalMdLinksChecked}`);
console.log(`Broken Internal Markdown Links: ${brokenMdLinks.length}`);
if (brokenMdLinks.length > 0) {
  brokenMdLinks.forEach(b => {
    console.error(`  [BROKEN] File: ${b.sourceFile} | Text: [${b.linkText}] | URL: ${b.url}`);
  });
}
const gate4_4 = brokenMdLinks.length === 0;
console.log(`GATE 4.4 RESULT: ${gate4_4 ? 'PASS ✓' : 'FAIL ✗'}`);

// SUMMARY
console.log('\n================================================================================');
console.log('PHASE B VALIDATION GATE SUMMARY');
console.log('================================================================================');
console.log(`Gate 4.1 (0 Missing Relocation Targets, 132 Moved):   ${gate4_1 ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Gate 4.2 (Protected Assets Untouched: 10 WS, 2 README, 17 BLOCKED): ${gate4_2 ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Gate 4.3 (0 Dangling References to Relocated Paths):  ${gate4_3 ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Gate 4.4 (0 Broken Internal Markdown Links):         ${gate4_4 ? 'PASS ✓' : 'FAIL ✗'}`);

const overallPass = gate4_1 && gate4_2 && gate4_3 && gate4_4;
console.log(`\nOVERALL GATE 4 VERDICT: ${overallPass ? 'ALL GATES PASS (PROCEED WITH COMMIT)' : 'GATE FAILED (DO NOT COMMIT)'}`);
console.log('================================================================================');

process.exit(overallPass ? 0 : 1);
