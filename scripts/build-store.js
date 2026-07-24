#!/usr/bin/env node
// Usage: node scripts/build-store.js [--variant=b1|b2]
// b1 (default) never bundles extractInject.ts -- the on-demand injection
// bundle only ships in the b2 variant, matching manifest.store.json staying
// B1-shaped (no "scripting") permanently.
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

const variantArg = process.argv.find(arg => arg.startsWith("--variant="));
const variant = variantArg ? variantArg.slice("--variant=".length) : "b1";
if (variant !== "b1" && variant !== "b2") {
  console.error("Usage: build-store.js [--variant=b1|b2]");
  process.exit(1);
}

const entryPoints = {
  content: path.join(root, "src/content.store.ts"),
  popup: path.join(root, "src/popup.store.ts"),
  background: path.join(root, "src/background.ts"),
  report: path.join(root, "src/report.ts"),
};
if (variant === "b2") entryPoints.extractInject = path.join(root, "src/extractInject.ts");

const options = { bundle: true, format: "iife", target: ["chrome114"], outdir: path.join(root, "dist", "store"), entryPoints };

function verify() {
  const files = ["dist/store/content.js", "dist/store/popup.js", "dist/store/background.js", "dist/store/report.js"];
  if (variant === "b2") files.push("dist/store/extractInject.js");
  const missing = files.filter(file => !fs.existsSync(path.join(root, file)));
  if (missing.length) throw new Error(`Missing referenced build files: ${missing.join(", ")}`);
  console.log(`referenced-files check: PASS (${files.length}/${files.length} outputs present) [variant=${variant}]`);
}

esbuild.build(options).then(verify).catch(error => { console.error(error); process.exit(1); });
