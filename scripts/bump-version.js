#!/usr/bin/env node
// Bumps the extension version in manifest.json and manifest.store.json together.
// Usage: node scripts/bump-version.js <patch|minor|major> [--dry-run]

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const manifestFiles = ['manifest.json', 'manifest.store.json'];
const manifestPaths = manifestFiles.map(f => path.join(root, f));

const bumpType = process.argv[2];
const dryRun = process.argv.includes('--dry-run');
if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Usage: node scripts/bump-version.js <patch|minor|major> [--dry-run]');
  process.exit(1);
}

function parseVersion(version) {
  const parts = version.split('.').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(n => !Number.isInteger(n) || n < 0)) {
    throw new Error(`Unsupported version "${version}" — expected "major.minor" or "major.minor.patch".`);
  }
  const [major, minor, patch = 0] = parts;
  return { major, minor, patch };
}

function nextVersion({ major, minor, patch }, type) {
  if (type === 'major') return `${major + 1}.0`;
  if (type === 'minor') return `${major}.${minor + 1}`;
  return `${major}.${minor}.${patch + 1}`;
}

const versions = manifestPaths.map(file => JSON.parse(fs.readFileSync(file, 'utf8')).version);
if (new Set(versions).size > 1) {
  throw new Error(`Manifests are out of sync (${manifestFiles.map((f, i) => `${f}=${versions[i]}`).join(', ')}). Fix by hand before bumping.`);
}

const current = versions[0];
const next = nextVersion(parseVersion(current), bumpType);

console.log(`${current} -> ${next}${dryRun ? ' (dry run, not written)' : ''}`);

if (!dryRun) {
  for (const file of manifestPaths) {
    const raw = fs.readFileSync(file, 'utf8');
    const updated = raw.replace(/"version":\s*"[^"]+"/, `"version": "${next}"`);
    fs.writeFileSync(file, updated);
  }
}
