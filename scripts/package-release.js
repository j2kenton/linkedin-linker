#!/usr/bin/env node
// Zips the assembled store build into the Chrome Web Store submission
// artifact. Usage: node scripts/package-release.js [--variant=b1|b2]
//   b1 (default): release/store/      -> release/store.zip
//   b2:           release/store-b2/   -> release/store-b2.zip
// Run after: npm run build:store[:b2]

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const variantArg = process.argv.find(arg => arg.startsWith('--variant='));
const variant = variantArg ? variantArg.slice('--variant='.length) : 'b1';
if (variant !== 'b1' && variant !== 'b2') {
  console.error('Usage: package-release.js [--variant=b1|b2]');
  process.exit(1);
}
const sourceDir = path.join(root, 'release', variant === 'b2' ? 'store-b2' : 'store');
const outputFile = path.join(root, 'release', variant === 'b2' ? 'store-b2.zip' : 'store.zip');
const buildCommand = variant === 'b2' ? 'npm run build:store:b2' : 'npm run build:store';

if (!fs.existsSync(sourceDir)) {
  console.error(`ERROR: ${sourceDir} does not exist — run "${buildCommand}" first.`);
  process.exit(1);
}

function listFiles(dir, base = dir) {
  const entries = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      entries.push(...listFiles(fullPath, base));
    } else {
      entries.push(path.relative(base, fullPath));
    }
  }
  return entries;
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c >>> 0;
}

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const dosDateTime = (date) => {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((year - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();

  return { dosDate, dosTime };
};

const uint16 = (value) => {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value, 0);
  return buffer;
};

const uint32 = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
};

const files = listFiles(sourceDir).sort();
if (files.length === 0) {
  console.error(`ERROR: ${sourceDir} is empty — run "${buildCommand}" first.`);
  process.exit(1);
}

const localEntries = [];
const centralEntries = [];
let offset = 0;
const now = dosDateTime(new Date());

for (const file of files) {
  const name = file.split(path.sep).join('/');
  const nameBuffer = Buffer.from(name);
  const data = fs.readFileSync(path.join(sourceDir, file));
  const checksum = crc32(data);

  const localHeader = Buffer.concat([
    uint32(0x04034b50),
    uint16(20),
    uint16(0),
    uint16(0),
    uint16(now.dosTime),
    uint16(now.dosDate),
    uint32(checksum),
    uint32(data.length),
    uint32(data.length),
    uint16(nameBuffer.length),
    uint16(0),
    nameBuffer
  ]);

  localEntries.push(localHeader, data);

  const centralHeader = Buffer.concat([
    uint32(0x02014b50),
    uint16(20),
    uint16(20),
    uint16(0),
    uint16(0),
    uint16(now.dosTime),
    uint16(now.dosDate),
    uint32(checksum),
    uint32(data.length),
    uint32(data.length),
    uint16(nameBuffer.length),
    uint16(0),
    uint16(0),
    uint16(0),
    uint16(0),
    uint32(0),
    uint32(offset),
    nameBuffer
  ]);

  centralEntries.push(centralHeader);
  offset += localHeader.length + data.length;
}

const centralDirectory = Buffer.concat(centralEntries);
const endRecord = Buffer.concat([
  uint32(0x06054b50),
  uint16(0),
  uint16(0),
  uint16(files.length),
  uint16(files.length),
  uint32(centralDirectory.length),
  uint32(offset),
  uint16(0)
]);

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, Buffer.concat([...localEntries, centralDirectory, endRecord]));

console.log(`Created ${outputFile} (${files.length} files)`);
