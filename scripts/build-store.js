#!/usr/bin/env node
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const options = { bundle:true, format:"iife", target:["chrome114"], outdir:path.join(root,"dist","store"), entryPoints:{
  content: path.join(root,"src/content.store.ts"),
  popup: path.join(root,"src/popup.store.ts"),
  background: path.join(root,"src/background.store.ts"),
  report: path.join(root,"src/report.ts"),
} };
function verify() { const files=["dist/store/content.js","dist/store/popup.js","dist/store/background.js","dist/store/report.js"]; const missing=files.filter(file => !fs.existsSync(path.join(root,file))); if (missing.length) throw new Error(`Missing referenced build files: ${missing.join(", ")}`); console.log(`referenced-files check: PASS (${files.length}/${files.length} outputs present)`); }
esbuild.build(options).then(verify).catch(error => { console.error(error); process.exit(1); });
