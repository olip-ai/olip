// Removes the local build-machine path that Docusaurus embeds in its config bundle
// (sidebarPath, customCss and similar build-time-only strings), so no machine path is published.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = path.join(root, 'build');
let changed = 0;
function walk(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html|json|txt|xml)$/.test(e.name)) {
      const s = fs.readFileSync(p, 'utf8');
      if (s.includes(root)) { fs.writeFileSync(p, s.split(root).join('/olip-site')); changed++; }
    }
  }
}
walk(build);
let left = 0;
(function scan(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scan(p); else if (fs.readFileSync(p).includes(root)) left++;
  }
})(build);
if (left) { console.error(`postbuild: ${left} file(s) still contain the build path`); process.exit(1); }
console.log(`postbuild: build path removed from ${changed} file(s).`);
