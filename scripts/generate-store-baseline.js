#!/usr/bin/env node
// Usage: node scripts/generate-store-baseline.js [--check] [--variant=b1|b2]
const crypto = require("crypto"); const fs = require("fs"); const path = require("path");
const variantArg = process.argv.find(arg => arg.startsWith("--variant="));
const variant = variantArg ? variantArg.slice("--variant=".length) : "b1";
if (variant !== "b1" && variant !== "b2") { console.error("Usage: generate-store-baseline.js [--check] [--variant=b1|b2]"); process.exit(1); }
const root = path.join(__dirname, "..", "release", variant === "b2" ? "store-b2" : "store"); const files=[];
function visit(dir) { for (const item of fs.readdirSync(dir, { withFileTypes:true })) { const full=path.join(dir,item.name); item.isDirectory() ? visit(full) : files.push(full); } }
visit(root); const manifest={}; for (const file of files.sort()) manifest[path.relative(root,file).replace(/\\/g,"/")] = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const baselinePath=path.join(__dirname,"..","test","fixtures", variant === "b2" ? "store-baseline.b2.json" : "store-baseline.json");
if (process.argv.includes("--check")) {
  if (!fs.existsSync(baselinePath)) { console.error(`Store baseline is missing (${baselinePath}). Run npm run generate:store-baseline${variant === "b2" ? ":b2" : ""} from the approved pre-change package.`); process.exit(1); }
  const baseline=JSON.parse(fs.readFileSync(baselinePath,"utf8"));
  if (JSON.stringify(baseline) !== JSON.stringify(manifest)) { console.error(`Store baseline check (${variant}): FAIL (packaged output differs from ${path.relative(path.join(__dirname,".."),baselinePath)})`); process.exit(1); }
  console.log(`Store baseline check (${variant}): PASS (${Object.keys(manifest).length} files match)`);
} else {
  fs.mkdirSync(path.dirname(baselinePath), { recursive:true }); fs.writeFileSync(baselinePath, JSON.stringify(manifest,null,2)+"\n"); console.log(`Store baseline (${variant}) written to ${path.relative(path.join(__dirname,".."),baselinePath)}.`);
}
