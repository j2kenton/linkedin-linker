#!/usr/bin/env node
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const options = { bundle:true, format:"iife", target:["chrome114"], outdir:path.join(root,"dist"), entryPoints:{ content:path.join(root,"src/content.ts"), popup:path.join(root,"src/popup.ts"), "background.dev":path.join(root,"src/background.dev.ts"), report:path.join(root,"src/report.ts") } };
function verify() { const files=["dist/content.js","dist/popup.js","dist/background.dev.js","dist/report.js"]; const missing=files.filter(file => !fs.existsSync(path.join(root,file))); if (missing.length) throw new Error(`Missing referenced build files: ${missing.join(", ")}`); console.log(`referenced-files check: PASS (${files.length}/${files.length} outputs present)`); }
if (process.argv.includes("--watch")) esbuild.context(options).then(context => context.watch()).then(() => { verify(); console.log("Watching developer build files."); }).catch(error => { console.error(error); process.exit(1); });
else esbuild.build(options).then(verify).catch(error => { console.error(error); process.exit(1); });
