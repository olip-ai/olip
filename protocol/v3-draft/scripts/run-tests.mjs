// Builds the TypeScript clients (3.0-draft, and the 2.0-draft one its helpers import), then runs every OLIP 3.0-draft
// test file with Node's built-in test runner, one file at a time.   node scripts/run-tests.mjs [name-filter ...]
import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args, cwd = root) => { const r = spawnSync(cmd, args, { cwd, stdio: "inherit" }); if (r.status !== 0) process.exit(r.status ?? 1); };
const tsc = join(root, "node_modules/typescript/bin/tsc");
run(process.execPath, [tsc, "-p", "sdk/typescript/tsconfig.json"]);
const v2 = join(root, "..", "v2-draft");
if (!existsSync(join(v2, "sdk/typescript/dist/index.js"))) run(process.execPath, [tsc, "-p", join(v2, "sdk/typescript/tsconfig.json")]);
const only = process.argv.slice(2);
const files = readdirSync(join(root, "tests")).filter((f) => f.endsWith(".test.mjs")).filter((f) => !only.length || only.some((o) => f.includes(o))).sort().map((f) => join("tests", f));
run(process.execPath, ["--test", "--test-concurrency=1", ...files]);
