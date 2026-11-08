// Tests for the "Try OLIP" browser simulation (src/try/engine.mjs).
// Happy path, every named negative branch, schema validity against the published OLIP schemas, and privacy.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {createSimulation, FIELD_CATALOG, fictionalTextProblems, consentDigest, canonicalize} from '../src/try/engine.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => path.join(root, 'protocol', ...p);
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const statusMachine = J(P('spec', 'status-machine.json'));
const ex = (n) => J(P('examples', n)).example;

const ajv = new Ajv2020({allErrors: true, strict: false});
addFormats(ajv);
for (const f of fs.readdirSync(P('schemas'))) ajv.addSchema(J(P('schemas', f)));
const valid = (name, obj) => {
  const v = ajv.getSchema(`https://olip.ai/spec/0.1/schemas/${name}.json`);
  assert.ok(v, `schema ${name} loaded`);
  const ok = v(obj);
  assert.ok(ok, `${name} invalid: ${JSON.stringify(v.errors, null, 1)}`);
};

const make = () => createSimulation({statusMachine, discovery: ex('02-discovery-plain-english.json'), noMatch: ex('03-discovery-no-match.json'),
  casebrief: ex('07-casebrief.json'), notices: ex('08-handoff-preview.json').notices});
const FIELDS = ['summary', 'client.name', 'client.email', 'location.jurisdiction', 'matter.code', 'key_dates'];

async function happy(sim, recipient = 'prf_test_alvarez') {
  const p = await sim.createPreview({recipient_ids: [recipient], field_paths: FIELDS});
  assert.equal(p.ok, true);
  assert.equal(sim.approve({source: 'user'}).ok, true);
  const h = await sim.submit();
  assert.equal(h.ok, true, JSON.stringify(h));
  return h.handoff;
}

test('consent digest matches the published example (same algorithm as the reference endpoint)', async () => {
  const pv = ex('08-handoff-preview.json');
  const d = await consentDigest({recipient_id: pv.recipient.professional_id, casebrief_id: pv.casebrief_id, casebrief_revision: pv.casebrief_revision,
    purpose: pv.purpose, mode: pv.mode, shared_fields: pv.shared_fields, notice_version: pv.notice_version});
  assert.equal(d, pv.consent_digest);
});

test('discovery: fictional candidates with disclosed, unpaid ordering', () => {
  const sim = make();
  const r = sim.discover({matter: 'housing.landlord_tenant'});
  assert.ok(r.results.length >= 2);
  assert.equal(r.ordering.paid_influence, false);
  for (const c of r.results) {
    assert.match(c.display_name, /\(fictional\)/);
    for (const l of c.licenses) assert.match(l.license_id, /^TEST-/);
    assert.match(c.firm.website, /\.test$/);
  }
  valid('discovery-response', r);
});

test('no match: returns free legal-help alternatives, no listings', () => {
  const r = make().discover({jurisdiction: 'US-WY', matter: 'housing.landlord_tenant'});
  assert.equal(r.results.length, 0);
  assert.ok(r.legal_aid_options.length >= 1);
  assert.ok(r.no_match.message);
  valid('discovery-response', r);
});

test('happy path: one recipient, approved fields only, recorded > queued > sent > delivered > acknowledged > responded', async () => {
  const sim = make();
  const h = await happy(sim);
  valid('handoff-preview', sim.state.preview);
  valid('authorization', sim.state.authorization);
  assert.deepEqual(Object.keys(h.payload).sort(), [...FIELDS].sort());
  assert.ok(!('facts' in h.payload) && !('documents' in h.payload));
  assert.ok(sim.state.preview.withheld_fields.includes('facts'));
  const seen = [h.state];
  for (let i = 0; i < 4; i++) { const r = await sim.advance(); assert.equal(r.ok, true, JSON.stringify(r)); seen.push(sim.state.handoff.state); }
  assert.deepEqual(seen, ['queued', 'sent', 'delivered', 'acknowledged', 'responded']);
  assert.deepEqual(h.events.map((e) => e.to_state), ['approved', 'recorded', 'queued', 'sent', 'delivered', 'acknowledged', 'responded']);
  for (const e of h.events) valid('status-event', e);
  valid('handoff', h);
  valid('receipt', h.receipt);
  assert.equal((await sim.verifyReceipt()).ok, true);
  assert.match(h.receipt.signature.kid, /^k_TEST_/);
  assert.match(h.receipt.statement, /not acceptance/);
  // Nothing further happens on its own: no state implies representation.
  const more = await sim.advance();
  assert.equal(more.ok, false);
});

test('two recipients are refused with OLIP_ONE_RECIPIENT_ONLY', async () => {
  const r = await make().createPreview({recipient_ids: ['prf_test_alvarez', 'prf_test_chen'], field_paths: FIELDS});
  assert.equal(r.error.code, 'OLIP_ONE_RECIPIENT_ONLY');
  valid('error', r.document);
});

test('the AI agent cannot approve its own request', async () => {
  const sim = make();
  await sim.createPreview({recipient_ids: ['prf_test_alvarez'], field_paths: FIELDS});
  const r = sim.approve({source: 'client'});
  assert.equal(r.error.code, 'OLIP_EVENT_SOURCE_FORBIDDEN');
  assert.equal(sim.state.authorization, null);
  const s = await sim.submit();
  assert.equal(s.error.code, 'OLIP_NOT_APPROVED');
});

test('the AI agent cannot record a recipient outcome', () => {
  assert.equal(make().agentClaimsOutcome().error.code, 'OLIP_EVENT_SOURCE_FORBIDDEN');
});

test('fields the person did not approve are blocked', async () => {
  const sim = make();
  await sim.createPreview({recipient_ids: ['prf_test_alvarez'], field_paths: ['summary', 'location.jurisdiction']});
  sim.approve({source: 'user'});
  const r = await sim.submit({extra_fields: ['client.email', 'facts']});
  assert.equal(r.error.code, 'OLIP_FIELD_NOT_ACCEPTED');
  assert.equal(sim.state.handoff, null);
});

test('a mismatched consent digest is rejected and nothing is sent', async () => {
  const sim = make();
  await sim.createPreview({recipient_ids: ['prf_test_alvarez'], field_paths: FIELDS});
  sim.approve({source: 'user'});
  const r = await sim.submit({consent_digest: 'sha256:' + 'f'.repeat(64)});
  assert.equal(r.error.code, 'OLIP_CONSENT_MISMATCH');
  assert.equal(sim.state.handoff, null);
});

test('editing the CaseBrief after approval makes the approval stale', async () => {
  const sim = make();
  await sim.createPreview({recipient_ids: ['prf_test_alvarez'], field_paths: FIELDS});
  sim.approve({source: 'user'});
  assert.equal(sim.editCaseBrief({summary: 'Fictional: changed after approval.'}).ok, true);
  const r = await sim.submit();
  assert.equal(r.error.code, 'OLIP_AUTHORIZATION_STALE');
  assert.equal(sim.state.handoff, null);
});

test('an approval cannot be used twice', async () => {
  const sim = make();
  await happy(sim);
  assert.equal((await sim.submit()).error.code, 'OLIP_AUTHORIZATION_USED');
});

test('offline fictional firm: failed after 3 attempts, no receipt, never delivered', async () => {
  const sim = make();
  await happy(sim, 'prf_test_okafor');
  const r = await sim.advance();
  assert.equal(r.ok, true);
  const h = sim.state.handoff;
  assert.equal(h.state, 'failed');
  assert.equal(h.receipt, null);
  assert.equal(h.delivery.attempts.length, 3);
  assert.ok(!h.events.some((e) => e.to_state === 'delivered'));
});

test('forged receipts are all rejected', async () => {
  const sim = make();
  await happy(sim);
  await sim.advance(); await sim.advance();
  const forged = await sim.forgedReceipts();
  assert.equal(forged.length, 3);
  for (const f of forged) assert.equal(f.result.ok, false, f.label);
  assert.deepEqual(forged.map((f) => f.result.reason), ['bad_signature', 'unknown_kid', 'missing_signature']);
});

test('cancel before transmission: not_transmitted', async () => {
  const sim = make();
  await sim.createPreview({recipient_ids: ['prf_test_alvarez'], field_paths: FIELDS});
  assert.equal((await sim.cancel()).effect, 'not_transmitted');
});

test('withdraw after delivery: the recipient may retain a copy', async () => {
  const sim = make();
  await happy(sim);
  await sim.advance(); await sim.advance();
  const r = await sim.cancel();
  assert.equal(r.effect, 'withdrawal_notice_sent_recipient_may_retain_copy');
  assert.ok(r.limits.some((l) => /may keep/.test(l)));
  assert.equal(sim.state.handoff.state, 'cancelled');
});

test('the demo refuses text that looks like real personal data', () => {
  assert.ok(fictionalTextProblems('mail me at jane.doe@gmail.com').length); // scan-publication: allow (test input that must be refused)
  assert.ok(fictionalTextProblems('call 415 555 1234 now').length);
  assert.ok(fictionalTextProblems('see https://realfirm.com/x').length);
  assert.deepEqual(fictionalTextProblems('Fictional: my landlord sent a notice. sample@example.test'), []);
  const r = make().editCaseBrief({summary: 'I am at jane@gmail.com'}); // scan-publication: allow (test input that must be refused)
  assert.equal(r.error.code, 'OLIP_INVALID_REQUEST');
});

test('privacy: the simulation code has no network, storage or cookie calls', () => {
  const files = [path.join(root, 'src/try/engine.mjs'), path.join(root, 'src/pages/try.js')];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '');
    for (const bad of ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'WebSocket', 'EventSource', 'localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'navigator.credentials']) {
      assert.ok(!src.includes(bad), `${path.basename(f)} must not use ${bad}`);
    }
    assert.ok(!/esqcopilot/i.test(src), `${path.basename(f)} must not reference a sponsor product`);
  }
});

test('field catalog only has CaseBrief paths that exist in the fictional example', () => {
  const cb = ex('07-casebrief.json');
  for (const f of FIELD_CATALOG) assert.notEqual(f.path.split('.').reduce((o, k) => o?.[k], cb), undefined, f.path);
  assert.equal(canonicalize({b: 1, a: [true, null]}), '{"a":[true,null],"b":1}');
});
