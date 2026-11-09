// Runs every tests/*.test.mjs, one file at a time, with the Node test runner.
// A shell glob in package.json is not expanded on Windows, and Node 20 does not expand it either.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join(dir, f));
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], {stdio: 'inherit'});
process.exit(r.status ?? 1);
