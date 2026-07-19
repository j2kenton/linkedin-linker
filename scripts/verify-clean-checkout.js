#!/usr/bin/env node
/**
 * Runs the documented clean-checkout test gate without mutating the active
 * working tree. The scratch copy is built from `git ls-files` (tracked plus
 * untracked-but-not-ignored paths), so this proves the checkout a fresh
 * `git clone` would produce actually builds and tests clean — not just
 * whatever happens to already be sitting on disk locally.
 */
const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.resolve(__dirname, "..");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "linkedin-linker-clean-"));

/**
 * Lists exactly the files a fresh `git clone` of this working tree would
 * contain: committed files plus untracked files that aren't gitignored. This
 * is what proves the check exercises what's actually committed/stageable,
 * not just whatever happens to be sitting on disk (e.g. inside an ignored
 * directory that was manually created).
 */
function checkoutFiles() {
  const result = childProcess.spawnSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "buffer" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("git ls-files failed while listing checkout contents.");
  return result.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter(relative => relative !== path.posix.join("src", "build-target.ts"));
}

function run(command, args) {
  // Invoking npm.cmd directly with a shell-disabled spawn is invalid on
  // Windows. npm supplies its CLI path to lifecycle scripts, so run that JS
  // entry with the current Node executable instead.
  const executable = command === "npm" && process.env.npm_execpath ? process.execPath : command;
  const commandArgs = command === "npm" && process.env.npm_execpath ? [process.env.npm_execpath, ...args] : args;
  const result = childProcess.spawnSync(executable, commandArgs, {
    cwd: scratch,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}.`);
}

try {
  for (const relative of checkoutFiles()) {
    const destination = path.join(scratch, ...relative.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, ...relative.split("/")), destination);
  }
  run("npm", ["ci"]);
  run("npm", ["test"]);
  if (!fs.existsSync(path.join(scratch, "src", "build-target.ts"))) {
    throw new Error("The pretest bootstrap did not generate src/build-target.ts.");
  }
  console.log("clean-checkout verification: PASS (npm ci && npm test)");
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
