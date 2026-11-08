// The site's single source of facts (src/data/release.json) must be valid and must match the real files.
// Also fails on stale or contradictory wording anywhere in the site source (content drift).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const J = (...p) => JSON.parse(fs.readFileSync(path.join(root, ...p), 'utf8'));
const R = J('src', 'data', 'release.json');
const count = (...p) => fs.readdirSync(path.join(root, ...p)).filter((f) => f.endsWith('.json')).length;

test('release.json is valid against its schema', () => {
  const ajv = new Ajv2020({allErrors: true, strict: false});
  addFormats(ajv);
  const v = ajv.compile(J('src', 'data', 'release.schema.json'));
  assert.ok(v(R), JSON.stringify(v.errors, null, 1));
});

test('schema and example counts match the protocol files', () => {
  assert.equal(R.counts.schemas_0_1, count('protocol', 'schemas'));
  assert.equal(R.counts.schemas_0_2, count('protocol', 'schemas-0.2'));
  assert.equal(R.counts.examples_0_1, count('protocol', 'examples'));
  assert.equal(R.counts.examples_0_2, count('protocol', 'examples-0.2'));
});

test('conformance counts match the suite results, and nothing fails', () => {
  for (const f of ['node-endpoint.json', 'python-endpoint.json']) {
    const r = J('protocol', 'conformance', 'results', f);
    const by = (p) => r.results.filter((c) => (p === '0.2' ? c.profile === 'olip-0.2' : c.profile !== 'olip-0.2')).length;
    assert.equal(by('0.1'), R.counts.conformance_checks_0_1, f);
    assert.equal(by('0.2'), R.counts.conformance_checks_0_2, f);
    assert.equal(r.fail, 0, `${f} has failures`);
    assert.equal(r.pass + r.fail + r.skip, r.results.length);
  }
});

test('license grant and sponsor are backed by the decision log and the licensing page', () => {
  const gov = fs.readFileSync(path.join(root, 'src', 'pages', 'governance.md'), 'utf8');
  assert.match(gov, new RegExp(`\\| ${R.licenses.decision} \\| ${R.licenses.granted_on} \\| Licenses granted`));
  const lic = fs.readFileSync(path.join(root, 'src', 'pages', 'license.md'), 'utf8');
  assert.ok(lic.includes(R.licenses.granted_on) && lic.includes(R.sponsor.name));
  for (const id of ['CC BY 4.0', 'OWFa 1.0', 'Apache License 2.0', 'CC0 1.0']) assert.ok(lic.includes(id), id);
});

test('no GitHub link is shown while the repository is not public', () => {
  if (R.repository.status === 'public') return;
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, {withFileTypes: true})) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(mdx?|js)$/.test(e.name)) files.push(p); } };
  ['docs', 'spec', 'src'].forEach((d) => walk(path.join(root, d)));
  files.push(path.join(root, 'docusaurus.config.js'));
  for (const f of files) assert.ok(!/github\.com\/(?!spdx|EthicalSource|mozilla)[\w-]+\/olip/i.test(fs.readFileSync(f, 'utf8')), `${f} links an OLIP GitHub repository that does not exist yet`);
});

test('content drift: stale or contradictory wording is gone from current pages', () => {
  const STALE = [
    [/cd olip-0\.1-draft/, 'kit unpacks to olip-0.2-draft'],
    [/once that license is approved/i, 'licenses were granted'],
    [/licens\w* (is|are) (still )?(pending|awaiting)/i, 'licenses were granted'],
    [/29 pass, 1 optional skip/, 'Python endpoint is 29 pass, 6 skip'],
    [/29 of 29 plus 1 optional skip/, 'Python endpoint is 29 pass, 6 skip'],
    [/OLIP certified|certified by OLIP|OLIP-certified/i, 'there is no certification'],
    [/Draft 0\.1 ·/, 'promoted version is 0.2'],
  ];
  const skip = new Set(['changelog.md', 'olip-0.1.md']); // history and the frozen 0.1 text keep their original words
  const walk = (d) => fs.readdirSync(d, {withFileTypes: true}).flatMap((e) => { const p = path.join(d, e.name); return e.isDirectory() ? walk(p) : /\.(mdx?|js)$/.test(e.name) ? [p] : []; });
  const files = ['docs', 'spec', 'src/pages'].flatMap((d) => walk(path.join(root, d))).concat(path.join(root, 'docusaurus.config.js'));
  for (const f of files) {
    if (skip.has(path.basename(f))) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      for (const [re, why] of STALE) {
        // A sentence that denies certification ("Is there an ... badge?", "Never ...") is fine.
        if (/certif/i.test(why) && /\b(never|no|not|is there)\b/i.test(line)) continue;
        assert.ok(!re.test(line), `${path.relative(root, f)}: "${line.match(re)?.[0]}" (${why})`);
      }
    }
  }
});

test('the quickstart folder name matches the folder inside the kit zip', () => {
  const sync = fs.readFileSync(path.join(root, 'scripts', 'sync-spec.mjs'), 'utf8');
  const folder = sync.match(/'\.olip-kit-stage', '([^']+)'/)[1];
  const qs = fs.readFileSync(path.join(root, 'docs', 'quickstart.md'), 'utf8');
  const cds = [...qs.matchAll(/^cd (olip-[\w.-]+)$/gm)].map((m) => m[1]);
  assert.ok(cds.length >= 2);
  for (const c of cds) assert.equal(c, folder);
});
