import fs from "node:fs";
import path from "node:path";

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
const releaseDir = "release";
const outputFile = path.join(
  releaseDir,
  `connection-request-assistant-${manifest.version}.zip`
);

const files = [
  "manifest.json",
  "popup.html",
  "dist/content.js",
  "dist/popup.js",
  "assets/icons-dev/icon16.png",
  "assets/icons-dev/icon32.png",
  "assets/icons-dev/icon48.png",
  "assets/icons-dev/icon128.png"
];

const missingFiles = files.filter((file) => !fs.existsSync(file));
if (missingFiles.length > 0) {
  throw new Error(`Missing package file(s): ${missingFiles.join(", ")}`);
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

const localEntries = [];
const centralEntries = [];
let offset = 0;
const now = dosDateTime(new Date());

for (const file of files) {
  const name = file.replaceAll(path.sep, "/");
  const nameBuffer = Buffer.from(name);
  const data = fs.readFileSync(file);
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

fs.mkdirSync(releaseDir, { recursive: true });
fs.writeFileSync(outputFile, Buffer.concat([...localEntries, centralDirectory, endRecord]));

console.log(`Created ${outputFile}`);
