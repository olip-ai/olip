// Builds the TypeScript client, then runs every OLIP 2.0-draft test file with Node's built-in test runner.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args) => { const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit" }); if (r.status !== 0) process.exit(r.status ?? 1); };
run(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", "sdk/typescript/tsconfig.json"]);
const only = process.argv.slice(2);
const files = readdirSync(join(root, "tests")).filter((f) => f.endsWith(".test.mjs")).filter((f) => !only.length || only.some((o) => f.includes(o))).sort().map((f) => join("tests", f));
run(process.execPath, ["--test", "--test-concurrency=1", ...files]);
