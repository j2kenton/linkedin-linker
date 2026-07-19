#!/usr/bin/env node
const crypto = require("crypto"); const fs = require("fs"); const path = require("path");
const root = path.join(__dirname, "..", "release", "store"); const files=[];
function visit(dir) { for (const item of fs.readdirSync(dir, { withFileTypes:true })) { const full=path.join(dir,item.name); item.isDirectory() ? visit(full) : files.push(full); } }
visit(root); const manifest={}; for (const file of files.sort()) manifest[path.relative(root,file).replace(/\\/g,"/")] = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const baselinePath=path.join(__dirname,"..","test","fixtures","store-baseline.json");
if (process.argv.includes("--check")) {
  if (!fs.existsSync(baselinePath)) { console.error("Store baseline is missing. Run npm run generate:store-baseline from the approved pre-change package."); process.exit(1); }
  const baseline=JSON.parse(fs.readFileSync(baselinePath,"utf8"));
  if (JSON.stringify(baseline) !== JSON.stringify(manifest)) { console.error("Store baseline check: FAIL (packaged output differs from test/fixtures/store-baseline.json)"); process.exit(1); }
  console.log(`Store baseline check: PASS (${Object.keys(manifest).length} files match)`);
} else {
  fs.mkdirSync(path.dirname(baselinePath), { recursive:true }); fs.writeFileSync(baselinePath, JSON.stringify(manifest,null,2)+"\n"); console.log("Store baseline written.");
}
