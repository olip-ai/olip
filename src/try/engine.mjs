// "Try OLIP" simulation engine. Runs entirely in the browser (and in Node 20+ for tests).
// FICTIONAL SIMULATION. NO REAL LAWYER IS CONTACTED. No network, no storage, no cookies.
// It follows the published OLIP 0.1 rules (spec sections 5.4 to 5.6) using the published status machine,
// and computes real SHA-256 digests and, where the browser supports it, real Ed25519 signatures with a
// throwaway TEST key that exists only in this page's memory.
//
// The engine takes its data (status machine, fictional examples) as arguments so it never fetches anything.

export const SIM_LABEL = 'FICTIONAL SIMULATION. NO REAL LAWYER CONTACTED.';
export const NOTICE_VERSION = 'olip-try-notices-2026-11-08';
export const PURPOSE = 'request_initial_contact';
export const MODE = 'consumer_selected_listing';

// OLIP canonical JSON (spec section 4 / 9.1): keys sorted by UTF-16 code unit, no whitespace, integers only.
export function canonicalize(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) throw new Error('OLIP canonical JSON allows integers only');
    return String(value);
  }
  if (Array.isArray(value)) return '[' + value.map((v) => canonicalize(v === undefined ? null : v)).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  throw new Error('Unsupported value in canonical JSON');
}

const subtle = () => globalThis.crypto && globalThis.crypto.subtle;
const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
const b64url = (buf) => {
  let s = '';
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export async function sha256(text) {
  return 'sha256:' + hex(await subtle().digest('SHA-256', new TextEncoder().encode(text)));
}

// Spec 5.4: consent_digest binds one recipient, one CaseBrief revision, the exact shared values,
// the purpose, the mode and the notice version.
export async function consentDigest({recipient_id, casebrief_id, casebrief_revision, purpose, mode, shared_fields, notice_version}) {
  const fields = [...shared_fields].map((f) => ({path: f.path, value: f.value}))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return sha256(canonicalize({olip_version: '0.1', recipient_id, casebrief_id, casebrief_revision, purpose, mode, shared_fields: fields, notice_version}));
}

export function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// ---------- Fictional-data guard ----------
// The demo refuses anything that looks like real personal data, so nobody pastes a real matter in.
export function fictionalTextProblems(text) {
  const problems = [];
  const t = String(text || '');
  for (const m of t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []) {
    if (!/\.(test|example)$|@example\.(com|org|net)$/i.test(m)) problems.push('an email address that is not a .test or example address');
  }
  if (/(\d[\s().-]*){7,}/.test(t)) problems.push('a long number (phone, account or ID numbers are not allowed here)');
  if (/https?:\/\/(?![^\s/]*\.(test|example)(\/|\s|$))/i.test(t)) problems.push('a web address that is not a .test address');
  if (t.length > 600) problems.push('more than 600 characters');
  return [...new Set(problems)];
}

// ---------- Status machine (published status-machine.json) ----------
export function makeMachine(statusMachine) {
  const find = (from, to, source) => {
    const t = statusMachine.transitions.find((x) => x.from === from && x.to === to);
    if (!t) return {ok: false, code: 'OLIP_INVALID_TRANSITION', message: `No transition from ${from} to ${to}.`};
    if (!t.sources.includes(source)) return {ok: false, code: 'OLIP_EVENT_SOURCE_FORBIDDEN', message: `The ${source} may not move a handoff from ${from} to ${to}.`};
    return {ok: true, transition: t};
  };
  return {
    find,
    transmitted: (s) => statusMachine.transmitted_states.includes(s),
    terminal: (s) => statusMachine.states[s]?.terminal === true,
  };
}

// ---------- Throwaway TEST signing key (Ed25519 via Web Crypto) ----------
export async function newTestKey(label = 'TEST recipient key') {
  try {
    const kp = await subtle().generateKey({name: 'Ed25519'}, false, ['sign', 'verify']);
    const raw = await subtle().exportKey('raw', kp.publicKey);
    const kid = 'k_TEST_' + hex(await subtle().digest('SHA-256', raw)).slice(0, 10);
    return {supported: true, kid, label, privateKey: kp.privateKey, publicKey: kp.publicKey,
      jwk: {kty: 'OKP', crv: 'Ed25519', x: b64url(raw), kid, alg: 'EdDSA', use: 'sig', test_only: true}};
  } catch {
    return {supported: false, kid: null, label, jwk: null};
  }
}

export async function signObject(obj, key) {
  const {signature, ...body} = obj;
  if (!key.supported) return {...body, signature: null};
  const sig = await subtle().sign({name: 'Ed25519'}, key.privateKey, new TextEncoder().encode(canonicalize(body)));
  return {...body, signature: {alg: 'EdDSA', kid: key.kid, value: b64url(sig)}};
}

// Verifies against a JWKS-like list of TEST public keys. Returns {ok, reason}.
export async function verifyObject(obj, keys) {
  if (!obj || !obj.signature) return {ok: false, reason: 'missing_signature'};
  const {signature, ...body} = obj;
  if (signature.alg !== 'EdDSA') return {ok: false, reason: 'unsupported_alg'};
  const k = keys.find((x) => x.kid === signature.kid);
  if (!k) return {ok: false, reason: 'unknown_kid'};
  try {
    const ok = await subtle().verify({name: 'Ed25519'}, k.publicKey, unb64url(signature.value), new TextEncoder().encode(canonicalize(body)));
    return ok ? {ok: true, reason: null} : {ok: false, reason: 'bad_signature'};
  } catch {
    return {ok: false, reason: 'bad_signature'};
  }
}

// ---------- Simulation ----------
let counter = 0;
const id = (p) => `${p}_TEST${String(++counter).padStart(4, '0')}`;
// An OLIP error document (error.json): {olip_version, error: {code, message, retryable, details}}.
const err = (code, message, details = null) => {
  const error = {code, message, retryable: false, ...(details ? {details} : {})};
  return {ok: false, error, document: {olip_version: '0.1', error}};
};

export const FIELD_CATALOG = [
  {path: 'summary', label: 'Summary (your words)'},
  {path: 'client.name', label: 'Your name'},
  {path: 'client.email', label: 'Your email'},
  {path: 'location.jurisdiction', label: 'State'},
  {path: 'location.county', label: 'County'},
  {path: 'matter.code', label: 'Type of problem'},
  {path: 'key_dates', label: 'Key dates'},
  {path: 'facts', label: 'Facts'},
  {path: 'objectives', label: 'What you want'},
  {path: 'documents', label: 'Documents (kept on device)'},
];

export function createSimulation({statusMachine, discovery, noMatch, casebrief, notices, now = () => new Date().toISOString()}) {
  const machine = makeMachine(statusMachine);
  const s = {
    candidates: discovery.results.map((r) => ({...r})),
    ordering: discovery.ordering,
    casebrief: {...structuredClone(casebrief), id: 'cbr_TEST_try', revision: 1, created_at: now(), updated_at: now()},
    notices,
    preview: null,
    authorization: null,
    handoff: null,
    keys: {recipient: null, attacker: null},
    log: [],
  };
  const log = (kind, text, data) => { s.log.push({at: now(), kind, text, data}); };

  const api = {
    state: s,
    machine,
    discover({jurisdiction, matter}) {
      const results = s.candidates.filter((r) => (!matter || r.matter_types.some((m) => m.code === matter)) &&
        (!jurisdiction || r.licenses.some((l) => l.jurisdiction === jurisdiction)));
      if (!results.length) {
        const out = {...structuredClone(noMatch), query: {jurisdiction: jurisdiction || null, matter: matter || null, language: null}};
        log('info', 'Discovery found no match. Free legal help options are shown instead.', out);
        return out;
      }
      const out = {olip_version: '0.1', interpretation: null, query: {jurisdiction: jurisdiction || null, matter: matter || null, language: null},
        ordering: s.ordering, results, no_match: null, legal_aid_options: [], notices: noMatch.notices};
      log('info', `Discovery returned ${results.length} fictional listing(s), ordered by ${s.ordering.method}.`, out);
      return out;
    },
    editCaseBrief(patch) {
      const text = patch.summary ?? s.casebrief.summary;
      const problems = fictionalTextProblems(text);
      if (problems.length) {
        return err('OLIP_INVALID_REQUEST', `This demo accepts fictional text only. Remove ${problems.join(', ')}.`, {field: 'summary', problems});
      }
      const cb = s.casebrief;
      if (patch.summary !== undefined) cb.summary = patch.summary;
      if (patch.jurisdiction !== undefined) cb.location = {...cb.location, jurisdiction: patch.jurisdiction};
      cb.revision += 1;
      cb.updated_at = now();
      log('info', `CaseBrief revision ${cb.revision} saved. Any earlier approval no longer matches.`);
      return {ok: true, casebrief: cb};
    },
    async createPreview({recipient_ids, field_paths}) {
      if (!Array.isArray(recipient_ids) || recipient_ids.length !== 1) {
        const e = err('OLIP_ONE_RECIPIENT_ONLY', 'A preview names exactly one recipient. Bulk or multi-recipient requests are refused (spec 5.4).');
        log('error', e.error.message, e.document);
        return e;
      }
      const r = s.candidates.find((x) => x.id === recipient_ids[0]);
      if (!r) return err('OLIP_NOT_FOUND', 'Unknown recipient.');
      const paths = FIELD_CATALOG.map((f) => f.path);
      const unknown = field_paths.filter((p) => !paths.includes(p));
      if (unknown.length) return err('OLIP_FIELD_NOT_ACCEPTED', `Unknown field: ${unknown.join(', ')}`);
      if (!field_paths.length) return err('OLIP_REQUIRED_FIELD_MISSING', 'Choose at least one field to share.');
      const shared_fields = FIELD_CATALOG.filter((f) => field_paths.includes(f.path))
        .map((f) => ({path: f.path, label: f.label, value: structuredClone(getPath(s.casebrief, f.path))}))
        .filter((f) => f.value !== undefined);
      const withheld_fields = paths.filter((p) => !field_paths.includes(p) && getPath(s.casebrief, p) !== undefined);
      const digest = await consentDigest({recipient_id: r.id, casebrief_id: s.casebrief.id, casebrief_revision: s.casebrief.revision,
        purpose: PURPOSE, mode: MODE, shared_fields, notice_version: NOTICE_VERSION});
      const created = now();
      s.preview = {
        olip_version: '0.1', preview_id: id('prv'), state: 'draft', casebrief_id: s.casebrief.id, casebrief_revision: s.casebrief.revision,
        recipient: {professional_id: r.id, display_name: r.display_name, firm_name: r.firm.name,
          license_statements: r.licenses.map((l) => l.display_statement), intake_endpoint_status: r.intake_endpoint_status, delivery_topology: 'direct'},
        mode: MODE, purpose: PURPOSE, shared_fields, withheld_fields, notices: s.notices, notice_version: NOTICE_VERSION,
        policy_gate: {result: 'allowed', code: 'allowed', message: 'Allowed by this simulation\'s illustrative rules (not legal review).',
          checks: [{check: 'user_selected_recipient', passed: true}], rules_review_status: 'pending_counsel_review', allowed_alternatives: []},
        consent_digest: digest, created_at: created, expires_at: new Date(Date.parse(created) + 30 * 60000).toISOString(),
        approval: {method: 'hosted_otp', url: 'https://approve.example.test/simulated', note: 'Simulated. In OLIP the person approves on a page the agent cannot complete alone.'},
        authorization_id: null,
      };
      s.authorization = null;
      s.handoff = null;
      log('info', `Preview for one recipient (${r.display_name}) with ${shared_fields.length} shared and ${withheld_fields.length} withheld fields. Consent digest computed.`, s.preview);
      return {ok: true, preview: s.preview};
    },
    // source "client" = the AI agent; "user" = the person on the approval page.
    approve({source}) {
      if (!s.preview) return err('OLIP_NOT_FOUND', 'Create a preview first.');
      const t = machine.find('draft', 'approved', source);
      if (!t.ok) {
        const e = err(t.code, source === 'client'
          ? 'The AI agent tried to approve its own request. Only the person can approve, on a surface the agent cannot complete alone (spec 5.4).'
          : t.message);
        log('error', e.error.message, e.document);
        return e;
      }
      const at = now();
      s.authorization = {olip_version: '0.1', authorization_id: id('auz'), preview_id: s.preview.preview_id, consent_digest: s.preview.consent_digest,
        method: 'hosted_otp', approved_at: at, expires_at: new Date(Date.parse(at) + 30 * 60000).toISOString(), single_use: true};
      s.preview.state = 'approved';
      s.preview.authorization_id = s.authorization.authorization_id;
      log('ok', 'The person approved exactly this preview. The approval is single-use, expires in 30 minutes and is bound to the consent digest.', s.authorization);
      return {ok: true, authorization: s.authorization};
    },
    async submit({consent_digest, extra_fields = [], firm_offline = false} = {}) {
      const a = s.authorization;
      if (!a) return err('OLIP_NOT_APPROVED', 'No approval exists. The person must approve first. Nothing was sent.');
      if (a.used_at) return err('OLIP_AUTHORIZATION_USED', 'This approval was already used.');
      const sent = consent_digest ?? a.consent_digest;
      if (sent !== a.consent_digest) {
        const e = err('OLIP_CONSENT_MISMATCH', 'The digest sent with the handoff does not match what the person approved. Nothing was sent.');
        log('error', e.error.message, e.document);
        return e;
      }
      if (extra_fields.length) {
        const e = err('OLIP_FIELD_NOT_ACCEPTED', `Not approved by the person: ${extra_fields.join(', ')}. Only approved fields can be transmitted. Nothing was sent.`);
        log('error', e.error.message, e.document);
        return e;
      }
      // Spec 5.4: hosts recompute the digest from the CaseBrief as it is now.
      const pv = s.preview;
      const current = await consentDigest({recipient_id: pv.recipient.professional_id, casebrief_id: s.casebrief.id, casebrief_revision: s.casebrief.revision,
        purpose: pv.purpose, mode: pv.mode,
        shared_fields: pv.shared_fields.map((f) => ({path: f.path, value: getPath(s.casebrief, f.path)})), notice_version: pv.notice_version});
      if (current !== a.consent_digest) {
        pv.state = 'cancelled';
        a.revoked_at = now();
        s.authorization = null; // a stale approval can never be used again; the person must approve a new preview
        const e = err('OLIP_AUTHORIZATION_STALE', 'The CaseBrief changed after the person approved it. Create a new preview and ask the person to approve again. Nothing was sent.');
        log('error', e.error.message, e.document);
        return e;
      }
      a.used_at = now();
      const payload = Object.fromEntries(pv.shared_fields.map((f) => [f.path, f.value]));
      const recipient = s.candidates.find((x) => x.id === pv.recipient.professional_id);
      s.handoff = {olip_version: '0.1', handoff_id: id('hnd'), state: 'approved', recipient_id: recipient.id, mode: pv.mode, purpose: pv.purpose,
        casebrief_id: pv.casebrief_id, casebrief_revision: pv.casebrief_revision, consent_digest: a.consent_digest, authorization_id: a.authorization_id,
        preview_id: pv.preview_id, created_at: now(), updated_at: now(), events: [], payload,
        payload_sha256: await sha256(canonicalize(payload)), receipt: null,
        delivery: {topology: 'direct', attempts: [], max_attempts: 3}, cancellation: null,
        state_meaning: statusMachine.states.approved.meaning,
        engagement: {status: 'unknown', statement: 'Delivery, acknowledgment or a reply is not acceptance of the matter and does not create an attorney-client relationship.'}};
      s.firmOffline = firm_offline || recipient.intake_endpoint_status !== 'active';
      await api._event('draft', 'approved', 'user', a.authorization_id);
      await api._event('approved', 'recorded', 'host', s.handoff.handoff_id);
      await api._event('recorded', 'queued', 'host');
      log('ok', 'Handoff recorded and queued. Only the approved fields are in the payload.', s.handoff);
      return {ok: true, handoff: s.handoff};
    },
    // Records one transition from the published status machine. The evidence type comes from the machine itself.
    // Events whose source is the recipient are signed with the recipient's TEST key (spec 5.6).
    async _event(from, to, source, ref = null, extra = {}) {
      const t = machine.find(from, to, source);
      if (!t.ok) return err(t.code, t.message);
      let ev = {event_id: id('evt'), handoff_id: s.handoff.handoff_id, from_state: from, to_state: to, occurred_at: now(), recorded_at: now(),
        source, actor: null, evidence: {type: t.transition.evidence[0], ref: ref ?? s.handoff.handoff_id, ...extra}, time_zone: 'UTC'};
      if (source.startsWith('recipient')) {
        if (!s.keys.recipient) s.keys.recipient = await newTestKey('TEST key of the fictional firm');
        if (s.keys.recipient.supported) ev = await signObject(ev, s.keys.recipient);
      }
      s.handoff.events.push(ev);
      s.handoff.state = to;
      s.handoff.state_meaning = statusMachine.states[to].meaning;
      s.handoff.updated_at = now();
      return {ok: true, event: ev};
    },
    // Moves the handoff one step forward, as the named party. Returns the new state or an OLIP error.
    async advance() {
      const h = s.handoff;
      if (!h) return err('OLIP_NOT_FOUND', 'No handoff yet.');
      if (h.state === 'queued') {
        if (s.firmOffline) {
          for (let i = 1; i <= h.delivery.max_attempts; i++) h.delivery.attempts.push({attempt: i, at: now(), outcome: 'connection_refused (simulated)'});
          const r = await api._event('queued', 'failed', 'host', `${h.delivery.max_attempts} attempts`);
          log('error', 'The fictional firm\'s intake endpoint is offline. After 3 failed attempts the handoff is "failed". No receipt exists, so it is never shown as delivered.', h.delivery);
          return r;
        }
        h.delivery.attempts.push({attempt: 1, at: now(), outcome: 'accepted_by_transport (simulated)'});
        const r = await api._event('queued', 'sent', 'transport');
        log('info', '"Sent" means a transport accepted it. It does not prove it reached the firm.');
        return r;
      }
      if (h.state === 'sent') {
        if (!s.keys.recipient) s.keys.recipient = await newTestKey('TEST key of the fictional firm');
        h.receipt = await signObject({receipt_id: id('rcp'), handoff_id: h.handoff_id, recipient_id: h.recipient_id, received_at: now(),
          payload_sha256: h.payload_sha256, consent_digest: h.consent_digest, retention_days: 365,
          statement: 'Stored by the recipient\'s intake system. This is not proof that a person has read it, and not acceptance of the matter.'}, s.keys.recipient);
        const r = await api._event('sent', 'delivered', 'recipient_system', h.receipt.receipt_id, {sha256: await sha256(canonicalize(h.receipt))});
        log('ok', s.keys.recipient.supported
          ? '"Delivered": the fictional firm\'s system stored it and signed a receipt with a TEST key. Nobody has read it yet.'
          : '"Delivered" (simulated). This browser cannot make Ed25519 signatures, so the receipt is UNSIGNED and cannot be verified.', h.receipt);
        return r;
      }
      if (h.state === 'delivered') {
        const r = await api._event('delivered', 'acknowledged', 'recipient_human');
        log('info', '"Acknowledged": a person at the fictional firm recorded viewing it. The firm has not agreed to anything.');
        return r;
      }
      if (h.state === 'acknowledged') {
        const r = await api._event('acknowledged', 'responded', 'recipient_human');
        log('info', '"Responded": a person sent a reply. This is not acceptance of the matter and not an attorney-client relationship.');
        return r;
      }
      return err('OLIP_INVALID_TRANSITION', `Nothing further happens automatically from "${h.state}".`);
    },
    // The AI agent (client) tries to record a recipient outcome itself.
    agentClaimsOutcome() {
      // No recipient-outcome transition in the published status machine lists "client" as a source.
      const t = machine.find('sent', 'delivered', 'client');
      const e = err(t.code, 'The AI agent may never record a recipient outcome such as "delivered" or "responded" (spec 5.6).');
      log('error', e.error.message, e.document);
      return e;
    },
    async verifyReceipt(receipt) {
      const r = receipt ?? s.handoff?.receipt;
      if (!r) return {ok: false, reason: 'no_receipt'};
      const keys = [s.keys.recipient].filter((k) => k && k.supported);
      const v = await verifyObject(r, keys);
      if (v.ok && (r.payload_sha256 !== s.handoff.payload_sha256 || r.consent_digest !== s.handoff.consent_digest)) return {ok: false, reason: 'receipt_does_not_match_handoff'};
      return v;
    },
    async forgedReceipts() {
      const h = s.handoff;
      if (!h?.receipt) return [];
      if (!s.keys.attacker) s.keys.attacker = await newTestKey('TEST key NOT bound to the firm');
      const edited = {...h.receipt, payload_sha256: 'sha256:' + '0'.repeat(64)};
      const otherKey = await signObject({...h.receipt}, s.keys.attacker);
      const unsigned = {...h.receipt, signature: null};
      const out = [];
      for (const [label, rec] of [['Edited after signing (payload hash changed)', edited], ['Signed with a key that is not the firm\'s', otherKey], ['Signature removed', unsigned]]) {
        out.push({label, receipt: rec, result: await api.verifyReceipt(rec)});
      }
      log('info', 'Three forged receipts were checked. Each one is rejected.', out.map((x) => ({label: x.label, result: x.result})));
      return out;
    },
    async cancel() {
      const h = s.handoff;
      if (!h) {
        if (s.preview) { s.preview.state = 'cancelled'; s.authorization = null; }
        log('info', 'Cancelled before anything was transmitted. Effect: not_transmitted.');
        return {ok: true, effect: 'not_transmitted'};
      }
      if (machine.terminal(h.state)) return err('OLIP_INVALID_TRANSITION', `A "${h.state}" handoff cannot be cancelled.`);
      const wasSent = machine.transmitted(h.state);
      const r = await api._event(h.state, 'cancelled', 'user');
      if (!r.ok) return r;
      h.cancellation = wasSent
        ? {requested_at: now(), effect: 'withdrawal_notice_sent_recipient_may_retain_copy', limits: ['The fictional firm already has a copy and may keep it under its own rules.', 'A withdrawal notice was sent (simulated).']}
        : {requested_at: now(), effect: 'not_transmitted', limits: []};
      log('info', wasSent ? 'Withdrawn after transmission: the firm is told, but it may keep the copy it already received.' : 'Cancelled before transmission: nothing left the host.', h.cancellation);
      return {ok: true, effect: h.cancellation.effect, limits: h.cancellation.limits};
    },
  };
  return api;
}
