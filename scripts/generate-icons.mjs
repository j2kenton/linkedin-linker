import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const outputDir = path.join("assets", "icons");
const sizes = [16, 32, 48, 128];

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

const pngChunk = (type, data) => {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
};

const encodePng = (width, height, rgba) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  const stride = width * 4;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    scanlines[y * (stride + 1)] = 0;
    rgba.copy(scanlines, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0))
  ]);
};

const distanceToSegment = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.hypot(px - x, py - y);
};

const insideRoundedRect = (x, y, size, inset, radius) => {
  const left = inset;
  const top = inset;
  const right = size - inset - 1;
  const bottom = size - inset - 1;

  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  return Math.hypot(x - cx, y - cy) <= radius;
};

const drawIcon = (size) => {
  const rgba = Buffer.alloc(size * size * 4);
  const inset = Math.max(1, Math.round(size * 0.06));
  const radius = Math.max(3, Math.round(size * 0.18));
  const lineWidth = Math.max(1.2, size * 0.045);
  const nodeRadius = Math.max(2, size * 0.1);
  const nodes = [
    [size * 0.3, size * 0.68],
    [size * 0.68, size * 0.32],
    [size * 0.72, size * 0.72]
  ];
  const segments = [
    [nodes[0], nodes[1]],
    [nodes[1], nodes[2]]
  ];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const px = x + 0.5;
      const py = y + 0.5;

      if (!insideRoundedRect(px, py, size, inset, radius)) {
        continue;
      }

      rgba[i] = 10;
      rgba[i + 1] = 102;
      rgba[i + 2] = 194;
      rgba[i + 3] = 255;

      const onLine = segments.some(([start, end]) =>
        distanceToSegment(px, py, start[0], start[1], end[0], end[1]) <= lineWidth
      );
      const onNode = nodes.some(([cx, cy]) =>
        Math.hypot(px - cx, py - cy) <= nodeRadius
      );

      if (onLine || onNode) {
        rgba[i] = 255;
        rgba[i + 1] = 255;
        rgba[i + 2] = 255;
      }
    }
  }

  return encodePng(size, size, rgba);
};

fs.mkdirSync(outputDir, { recursive: true });

for (const size of sizes) {
  fs.writeFileSync(
    path.join(outputDir, `icon${size}.png`),
    drawIcon(size)
  );
}

console.log(`Generated ${sizes.length} icon files in ${outputDir}`);
