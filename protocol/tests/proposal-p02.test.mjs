// Proposal P-02 (not part of OLIP 0.1): the fictional capability card validates, and scoring fields are refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'proposals', 'v12');
const read = (p) => JSON.parse(fs.readFileSync(path.join(dir, p), 'utf8'));

let Ajv2020, addFormats;
try { Ajv2020 = require('ajv/dist/2020').default ?? require('ajv/dist/2020'); addFormats = require('ajv-formats').default ?? require('ajv-formats'); } catch { /* optional */ }

test('P-02 capability card example validates; score fields are refused', {skip: !Ajv2020 && 'ajv not installed'}, () => {
  const ajv = new Ajv2020({allErrors: true, strict: false}); addFormats(ajv);
  const v = ajv.compile(read('schemas/intake-capability-card-0.1-draft.json'));
  const card = read('examples/intake-capability-card.TEST.json');
  assert.equal(v(card), true, JSON.stringify(v.errors));
  for (const bad of ['quality_score', 'rank', 'win_rate', 'response_rate']) {
    assert.equal(v({...card, [bad]: 1}), false, `${bad} must be refused`);
  }
});

test('P-02 examples are fictional', () => {
  const all = fs.readdirSync(path.join(dir, 'examples')).map((f) => fs.readFileSync(path.join(dir, 'examples', f), 'utf8')).join('\n');
  for (const m of all.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) assert.match(m[1], /(^|\.)example\.org$|^olip\.ai$/, m[0]);
});
