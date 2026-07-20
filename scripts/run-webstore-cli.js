#!/usr/bin/env node
// Loads .env.local (if present) into process.env, then runs chrome-webstore-upload-cli.
// Wired this way so `npm run webstore:*` works whether or not the calling shell/tool
// already sourced .env.local (e.g. an IDE-triggered release action).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

const [subcommand, ...extraArgs] = process.argv.slice(2);
if (subcommand !== 'upload' && subcommand !== 'publish') {
  console.error('Usage: node scripts/run-webstore-cli.js <upload|publish> [...args]');
  process.exit(1);
}

const missing = ['CLIENT_ID', 'CLIENT_SECRET', 'REFRESH_TOKEN', 'PUBLISHER_ID'].filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`ERROR: missing credentials in .env.local: ${missing.join(', ')}`);
  process.exit(1);
}

const result = spawnSync('npx', ['chrome-webstore-upload-cli', subcommand, ...extraArgs], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
