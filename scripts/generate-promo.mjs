// Generates the Chrome Web Store promo tiles for "Career Connect":
//   assets/promo/promo-small.png    440 x 280  (small promo tile)
//   assets/promo/promo-marquee.png 1400 x 560 (marquee promo tile)
// Both reuse the store icon graphic (assets/icons/generate-icons.mjs) + wordmark, rendered via Puppeteer.

import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const BG = "#EAF3FC";
const PRIMARY = "#0A66C2";
const TEXT = "#1D2226";
const TEXT_SECONDARY = "#56687A";
const BORDER = "#424242";
const EDGE = "#0C1B47";
const NODE = "#1E3A8A";

// Recreated to match scripts/generate-icons.mjs's store variant exactly
// (rounded white tile, dark-gray border, navy node graph).
function iconSVG(size) {
  return `
<svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="100" height="100" rx="20" fill="#ffffff"/>
  <rect x="3.15" y="3.15" width="93.7" height="93.7" rx="16.85"
        fill="none" stroke="${BORDER}" stroke-width="4.5"/>
  <g fill="none" stroke="${EDGE}" stroke-width="5" stroke-linecap="round">
    <line x1="28" y1="50" x2="44" y2="68"/>
    <line x1="44" y1="68" x2="74" y2="32"/>
  </g>
  <g fill="${NODE}">
    <circle cx="28" cy="50" r="10"/>
    <circle cx="44" cy="68" r="10"/>
    <circle cx="74" cy="32" r="11.5"/>
  </g>
</svg>`;
}

function buildHTML({ W, H, gap, iconSize, wordSize, tagSize, tagGap, tagline }) {
  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; }
  body {
    background: ${BG};
    display: flex;
    align-items: center;
    justify-content: center;
    gap: ${gap}px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .icon { display: flex; }
  .word { color: ${TEXT}; line-height: 1.05; }
  .word .career  { font-size: ${wordSize}px; font-weight: 700; letter-spacing: -0.5px; }
  .word .connect { font-size: ${wordSize}px; font-weight: 700; letter-spacing: -0.5px; color: ${PRIMARY}; }
  .word .tag {
    margin-top: ${tagGap}px;
    font-size: ${tagSize}px;
    font-weight: 500;
    color: ${TEXT_SECONDARY};
    letter-spacing: 0.2px;
    white-space: nowrap;
  }
</style></head>
<body>
  <div class="icon">${iconSVG(iconSize)}</div>
  <div class="word">
    <div class="career">Career</div>
    <div class="connect">Connect</div>
    <div class="tag">${tagline}</div>
  </div>
</body></html>`;
}

const TILES = [
  {
    file: "promo-small.png",
    W: 440,
    H: 280,
    gap: 22,
    iconSize: 100,
    wordSize: 38,
    tagSize: 13,
    tagGap: 10,
    tagline: "LinkedIn invites + AI interview prep",
  },
  {
    file: "promo-marquee.png",
    W: 1400,
    H: 560,
    gap: 90,
    iconSize: 320,
    wordSize: 116,
    tagSize: 32,
    tagGap: 32,
    tagline: "LinkedIn invite drafts, plus AI interview prep",
  },
];

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--force-device-scale-factor=1"],
  });
  for (const t of TILES) {
    const page = await browser.newPage();
    await page.setViewport({ width: t.W, height: t.H, deviceScaleFactor: 1 });
    await page.setContent(buildHTML(t), { waitUntil: "networkidle0" });
    const outPath = path.join("assets", "promo", t.file);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({
      path: outPath,
      clip: { x: 0, y: 0, width: t.W, height: t.H },
    });
    await page.close();
    console.log(`Wrote ${outPath} (${t.W}x${t.H})`);
  }
  await browser.close();
})();
