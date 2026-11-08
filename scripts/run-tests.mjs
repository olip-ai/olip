// Runs every tests/*.test.mjs with the Node test runner (works the same on Windows, macOS and Linux).
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'tests');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join(dir, f));
const r = spawnSync(process.execPath, ['--test', ...files], {stdio: 'inherit'});
process.exit(r.status ?? 1);
