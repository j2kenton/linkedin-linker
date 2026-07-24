#!/usr/bin/env node
// Assembles the store-ready extension into release/store/ (b1, default) or
// release/store-b2/ (b2). Run after: npm run build:store[:b2]
//
// The checked-in manifest.store.json is the B1 base and stays B1-shaped
// permanently. The B2 variant applies one fixed permission delta ("scripting"
// + optional_host_permissions: ["<all_urls>"]) in memory here and writes the
// transformed manifest only into the package output -- this script never
// modifies manifest.store.json or any other working-tree file.

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const variantArg = process.argv.find(arg => arg.startsWith('--variant='));
const variant = variantArg ? variantArg.slice('--variant='.length) : 'b1';
if (variant !== 'b1' && variant !== 'b2') {
  console.error('Usage: package-store.js [--variant=b1|b2]');
  process.exit(1);
}

const outDir = path.join(root, 'release', variant === 'b2' ? 'store-b2' : 'store');

// Clean and recreate output dir
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(outDir, 'dist'), { recursive: true });

// manifest -- transformed in memory only; the checked-in file is untouched.
const baseManifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.store.json'), 'utf8'));
const manifest = variant === 'b2'
  ? {
      ...baseManifest,
      permissions: [...baseManifest.permissions, 'scripting'],
      optional_host_permissions: ['<all_urls>'],
    }
  : baseManifest;
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// popup -- store build uses its own HTML (no Live Mode UI)
fs.copyFileSync(path.join(root, 'popup.store.html'), path.join(outDir, 'popup.store.html'));

// report.html -- Career Tools report tab (opened via chrome.tabs.create)
fs.copyFileSync(path.join(root, 'report.html'), path.join(outDir, 'report.html'));

// compiled JS -- store build outputs to dist/store/ to avoid clobbering dist/
// esbuild's entryPoints keys already name these content.js/popup.js/background.js/report.js.
const jsCopies = [
  ['content.js', 'content.js'],
  ['background.js', 'background.js'],
  ['popup.js', 'popup.js'],
  ['report.js', 'report.js'],
];
// extractInject.js (the on-demand read-only extraction handler) only ships
// in the b2 package -- b1 must never package or execute a chrome.scripting
// injection path.
if (variant === 'b2') jsCopies.push(['extractInject.js', 'extractInject.js']);

const missing = [];
for (const [src, dest] of jsCopies) {
  const srcPath = path.join(root, 'dist', 'store', src);
  if (!fs.existsSync(srcPath)) {
    missing.push(srcPath);
  } else {
    fs.copyFileSync(srcPath, path.join(outDir, 'dist', dest));
  }
}
if (missing.length > 0) {
  console.error('ERROR: Missing compiled files — aborting store package:');
  missing.forEach(f => console.error('  ' + f));
  process.exit(1);
}

// assets (icons etc) if present — copy recursively.
// icons-dev holds the light-blue developer-build icons; the store build must
// not ship them.
const ASSET_EXCLUDES = new Set(['icons-dev']);
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (ASSET_EXCLUDES.has(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const assetsDir = path.join(root, 'assets');
if (fs.existsSync(assetsDir)) {
  copyDir(assetsDir, path.join(outDir, 'assets'));
}

console.log(`Store extension (${variant}) assembled at: ${outDir}`);
console.log('Load it in Chrome via chrome://extensions > Load unpacked, or zip the folder for submission.');
