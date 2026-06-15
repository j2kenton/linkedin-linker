#!/usr/bin/env node
// Assembles the store-ready extension into release/store/
// Run after: npm run build:store

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'release', 'store');

// Clean and recreate output dir
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(path.join(outDir, 'dist'), { recursive: true });

// manifest
fs.copyFileSync(
  path.join(root, 'manifest.store.json'),
  path.join(outDir, 'manifest.json')
);

// popup — store build uses its own HTML (no Live Mode UI)
fs.copyFileSync(path.join(root, 'popup.store.html'), path.join(outDir, 'popup.store.html'));

// compiled JS — store build outputs to dist/store/ to avoid clobbering dist/
// popup.store.ts compiles to popup.store.js; rename it to popup.js in the release package.
const jsCopies = [
  ['content.store.js', 'content.js'],
  ['background.js', 'background.js'],
  ['popup.store.js', 'popup.js'],
];
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

// assets (icons etc) if present — copy recursively
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
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

console.log(`Store extension assembled at: ${outDir}`);
console.log('Load it in Chrome via chrome://extensions > Load unpacked, or zip the folder for submission.');
