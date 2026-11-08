// Pre-publication scan for the public OLIP repository and the built website.
// Fails on anything that looks like a secret, a private or internal reference, real personal data,
// or a machine path. Usage: node scripts/scan-publication.mjs <dir> [--report out.json]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const dir = path.resolve(process.argv[2] || '.');
const reportAt = process.argv.includes('--report') ? process.argv[process.argv.indexOf('--report') + 1] : null;
const SKIP_DIRS = new Set(['node_modules', '.git', '.docusaurus', '__pycache__']);
const BINARY = /\.(png|jpe?g|gif|ico|woff2?|ttf|zip|pyc)$/i;

const RULES = [
  ['private_key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['cloud_token', /\b(sk_live_|sk_test_|rk_live_|ghp_[A-Za-z0-9]{20,}|github_pat_|xox[abpr]-|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|sbp_[0-9a-f]{20,})/],
  ['supabase', /[a-z0-9]{20}\.supabase\.(co|in)/i],
  ['internal_name', /\b(sustany|kameir|alcbar|lemlist|millionverifier|hpanel|casemagic)\b/i],
  ['internal_host', /\b(match|directory|crm)\.esqcopilot\.com|esqcopilot\.com\/crm/i],
  ['ip_address', /(?<![\d.])(?!127\.0\.0\.1(?![\d.]))(?!0\.0\.0\.0(?![\d.]))(?:\d{1,3}\.){3}\d{1,3}(?![\d.])/],
  ['machine_path', /([A-Z]:\\\\(Users|AI Law|Projects)|\/home\/user\/|\/mnt\/project-files|\/root\/|\/tmp\/claude)/],
  ['email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi],
  ['phone', /\+?1?[\s.(-]*\d{3}[\s.)-]+(?!555)\d{3}[\s.-]+\d{4}\b/],
];
const EMAIL_OK = [/\.test$/i, /@example\.(com|org|net)$/i, /\.example$/i, /^notices@esqcopilot\.com$/i, /^noreply@/i, /@users\.noreply\.github\.com$/i];
// Version strings and similar that look like IPs.
const IP_OK = (m) => m.split('.').some((x) => Number(x) > 255 || (x.length > 1 && x.startsWith('0')));

// Reviewed exceptions: {file, rule, reason}. Every entry is a human decision recorded in the repository.
const ALLOW = (() => { try { return JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'scan-allow.json'), 'utf8')); } catch { return []; } })();
const allowed = (rel, rule) => ALLOW.some((a) => a.rule === rule && (a.file === rel || rel.endsWith('/' + a.file)));
const findings = [];
function scanFile(f) {
  const rel = path.relative(dir, f).split(path.sep).join('/');
  if (BINARY.test(f)) return;
  const lock = /package-lock\.json$/.test(f);
  const text = fs.readFileSync(f, 'utf8');
  if (/scan-publication\.mjs$|scan-allow\.json$/.test(f)) return;
  text.split('\n').forEach((line, i) => {
    if (line.includes('scan-publication: allow')) return;
    for (const [rule, re] of RULES) {
      if (allowed(rel, rule)) continue;
      if (lock && ['email', 'ip_address', 'phone'].includes(rule)) continue;
      const ms = rule === 'email' ? line.match(re) || [] : (line.match(re) ? [line.match(re)[0]] : []);
      for (const m of ms) {
        if (rule === 'email' && EMAIL_OK.some((ok) => ok.test(m))) continue;
        if (rule === 'email' && /\.(png|svg|js|css|json)$/i.test(m)) continue;
        if (rule === 'ip_address' && (IP_OK(m) || /\d+\.\d+\.\d+\.\d+-/.test(line) || /version|"v?\d+\.\d+\.\d+\.\d+"/i.test(line))) continue;
        findings.push({rule, file: rel, line: i + 1, match: m.slice(0, 80)});
      }
    }
  });
}
function walk(d) {
  for (const e of fs.readdirSync(d, {withFileTypes: true})) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p); else scanFile(p);
  }
}
walk(dir);
const out = {scanned: dir, at: new Date().toISOString(), findings};
if (reportAt) fs.writeFileSync(reportAt, JSON.stringify(out, null, 2));
for (const f of findings) console.log(`${f.rule}\t${f.file}:${f.line}\t${f.match}`);
console.log(`scan-publication: ${findings.length} finding(s) in ${dir}`);
process.exit(findings.length ? 1 : 0);
