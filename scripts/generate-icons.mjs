import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const outputDir = path.join("assets", "icons");
const sizes = [16, 32, 48, 128];

const BACKGROUND = [255, 255, 255, 255];
const BORDER = [66, 66, 66, 255];
const NODE = [30, 58, 138, 255];
const EDGE = [12, 27, 71, 255];

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

const createCanvas = (size) => {
  const rgba = Buffer.alloc(size * size * 4);

  const blend = (x, y, color, alpha) => {
    if (x < 0 || y < 0 || x >= size || y >= size || alpha <= 0) {
      return;
    }

    const i = (y * size + x) * 4;
    const backdropAlpha = rgba[i + 3] / 255;
    const outAlpha = alpha + backdropAlpha * (1 - alpha);
    if (outAlpha === 0) {
      return;
    }

    for (let channel = 0; channel < 3; channel += 1) {
      rgba[i + channel] = Math.round(
        (color[channel] * alpha + rgba[i + channel] * backdropAlpha * (1 - alpha)) / outAlpha
      );
    }
    rgba[i + 3] = Math.round(outAlpha * 255);
  };

  const coverage = (distance) => Math.max(0, Math.min(1, 0.5 - distance));

  const fillRoundedSquare = (radius, inset, color) => {
    const center = size / 2;
    const extent = size / 2 - radius - 0.5 - inset;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = Math.max(0, Math.abs(x - center) - extent);
        const dy = Math.max(0, Math.abs(y - center) - extent);
        blend(x, y, color, coverage(Math.hypot(dx, dy) - radius));
      }
    }
  };

  const strokeRoundedSquare = (radius, inset, strokeWidth, color) => {
    const center = size / 2;
    const extent = size / 2 - radius - 0.5 - inset;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = Math.max(0, Math.abs(x - center) - extent);
        const dy = Math.max(0, Math.abs(y - center) - extent);
        const distance = Math.hypot(dx, dy) - radius;
        blend(x, y, color, Math.max(0, Math.min(1, strokeWidth / 2 - Math.abs(distance))));
      }
    }
  };

  const drawLine = ([x0, y0], [x1, y1], strokeWidth, color) => {
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const lx = x0 + (x1 - x0) * t;
      const ly = y0 + (y1 - y0) * t;
      for (let y = Math.floor(ly - strokeWidth); y <= Math.ceil(ly + strokeWidth); y += 1) {
        for (let x = Math.floor(lx - strokeWidth); x <= Math.ceil(lx + strokeWidth); x += 1) {
          blend(x, y, color, coverage(Math.hypot(x - lx, y - ly) - strokeWidth / 2));
        }
      }
    }
  };

  const drawCircle = ([cx, cy], radius, color) => {
    for (let y = Math.floor(cy - radius - 1); y <= Math.ceil(cy + radius + 1); y += 1) {
      for (let x = Math.floor(cx - radius - 1); x <= Math.ceil(cx + radius + 1); x += 1) {
        blend(x, y, color, coverage(Math.hypot(x - cx, y - cy) - radius));
      }
    }
  };

  return { rgba, fillRoundedSquare, strokeRoundedSquare, drawLine, drawCircle };
};

const drawIcon = (size) => {
  const canvas = createCanvas(size);

  const radius = Math.round(size * 0.2);
  const borderWidth = Math.max(1, size * 0.045);

  canvas.fillRoundedSquare(radius, 0, BACKGROUND);
  canvas.strokeRoundedSquare(radius - borderWidth * 0.7, borderWidth * 0.7, borderWidth, BORDER);

  const strokeWidth = Math.max(1, size * 0.05);
  const nodeRadius = size * 0.1;
  const nodes = [
    [size * 0.28, size * 0.5],
    [size * 0.44, size * 0.68],
    [size * 0.74, size * 0.32]
  ];

  canvas.drawLine(nodes[0], nodes[1], strokeWidth, EDGE);
  canvas.drawLine(nodes[1], nodes[2], strokeWidth, EDGE);
  canvas.drawCircle(nodes[0], nodeRadius, NODE);
  canvas.drawCircle(nodes[1], nodeRadius, NODE);
  canvas.drawCircle(nodes[2], nodeRadius * 1.15, NODE);

  return encodePng(size, size, canvas.rgba);
};

fs.mkdirSync(outputDir, { recursive: true });

for (const size of sizes) {
  fs.writeFileSync(
    path.join(outputDir, `icon${size}.png`),
    drawIcon(size)
  );
}

console.log(`Generated ${sizes.length} icon files in ${outputDir}`);
