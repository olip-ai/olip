// OLIP 3.0-draft reference AGENT COMPATIBILITY LAYER. PROPOSED, NOT ADOPTED. Mock mode for real use: fictional data only.
//
// What it is: one semantics-first engine that every binding calls (HTTPS here; MCP and A2A adapters call the HTTPS
// binding through the SDK). It adds a machine-readable action manifest, a policy gateway, durable workflows with a
// signed event journal, user-controlled context capsules, and a deterministic next-actions planner, ON TOP OF the
// unchanged 2.0-draft lifecycle host.
//
// Deployment shape (see docs/ARCHITECTURE.md, ADR-3): the layer runs inside the same resource server as the 2.0-draft
// host. It reuses that host's sign-in, tokens and audience, and forwards lifecycle steps to the unchanged 2.0 handlers
// in-process. No token crosses a trust boundary, and every 2.0 consent and firm-authority check still runs.
// In production mode every regulated write fails closed because no jurisdiction policy has been approved by counsel.
import { randomBytes } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { V3, V2_WIRE, V3_EXTENSION, PROFILE, RELEASE_STATUS, RELEASE_STATEMENT, signingKey, signDetached, verifyDetached, digestOf, newId, safeEqual, hmac, sameBytes,
  ZERO_DIGEST, getPath, leafPaths, FIELD_PATH, sensitiveFindings, injectionFindings, checkCallbackUrl, sealToRecipient, canonicalize } from "./lib/core.mjs";
import { OlipV3Error, fail, fromV2, errorBody, ERRORS } from "./lib/errors.mjs";
import { ACTIONS, ACTION_BY_ID, LIFECYCLE_OPERATIONS, contractOf, EFFECT_MEANING, strictest } from "./actions.mjs";
import { createPolicy } from "./policy.mjs";
import { createStore } from "./store.mjs";
import { planNextActions } from "./planner.mjs";
import { SCHEMAS, STATUS_SEMANTICS } from "./schemas.mjs";
import { AGENT_CLIENTS, OPERATOR } from "./fixtures.mjs";
import { readFileSync } from "node:fs";

// Exact pinned SDK versions, read from this folder's package.json (the lockfile pins the same versions).
const PKG = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const MCP_SDK = PKG.devDependencies["@modelcontextprotocol/sdk"];
const A2A_SDK = PKG.devDependencies["@a2a-js/sdk"];
const CAPSULE_TTL_S = 7 * 86400, IMPORT_AUTH_TTL_S = 3600, MANIFEST_TTL_S = 3600, OPERATOR_TTL_S = 600;
const TOOL_RESULT_NOTE = "A successful call means this host ran the action. It does not mean any organization received, read or accepted anything; read delivery and lifecycle states for that.";

export function createAgentLayer({ v2, mode = "mock", clock, storePath = null, hostLabel = "v3-host", trustedCapsuleIssuers = [], webhooks = {}, allowLoopbackCallbacksForTests = false, combinedWith10 = false, policyOverrides, observe = null } = {}) {
  if (!["mock", "production"].includes(mode)) throw new Error("mode must be mock or production");
  if (!v2?.handle || !v2?.state) throw new Error("the 3.0-draft layer needs a co-located 2.0-draft lifecycle host");
  const keys = { events: signingKey(`${hostLabel}/workflow-events`, "workflow_events"), capsules: signingKey(`${hostLabel}/capsules`, "capsule_issuer"), manifest: signingKey(`${hostLabel}/manifest`, "manifest") };
  const jwks = () => Object.values(keys).map((k) => ({ ...k.publicJwk, status: "active" }));
  const policy = createPolicy({ mode, clock, overrides: policyOverrides });
  const store = createStore({ path: storePath });
  const cursorSecret = Buffer.from(hmac("olip-3.0-draft cursor", hostLabel)); // stable across restarts of the same host
  const subjectSecret = Buffer.from(hmac("olip-3.0-draft subject", hostLabel));
  const operatorTokens = new Map();
  const WH = { baseDelayMs: 200, maxAttempts: 5, timeoutMs: 3000, ...webhooks };
  const iso = (d = clock.now()) => d.toISOString();
  const plus = (s) => new Date(clock.now().getTime() + s * 1000).toISOString();
  const nowMs = () => clock.now().getTime();
  const ajv = new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv);
  for (const s of Object.values(SCHEMAS)) ajv.addSchema(s);
  const inputValidators = Object.fromEntries(ACTIONS.map((a) => [a.id, ajv.compile(a.input)]));
  const validateCapsuleShape = ajv.getSchema(SCHEMAS["context-capsule"].$id);

  // ---------- authentication (shared token store of the co-located 2.0-draft host) ----------
  function authenticate(headers) {
    const h = String(headers.authorization || "");
    if (!h.startsWith("Bearer ")) return null;
    const t = h.slice(7);
    const op = operatorTokens.get(t);
    if (op) { if (op.expires_at <= nowMs()) fail("AUTH_REQUIRED", "The operator token has expired."); return { kind: "operator", operator_id: op.operator_id, token: h }; }
    const rec = v2.state.tokens.get(t);
    if (!rec) fail("AUTH_REQUIRED", "The token is not valid.");
    if (rec.expires_at <= nowMs()) fail("AUTH_REQUIRED", "The token has expired.");
    if (rec.principal.kind === "agent" && v2.state.delegations.get(rec.principal.delegation_id)?.revoked) fail("GRANT_REVOKED", "The user revoked this assistant's access.");
    return { ...rec.principal, token: h };
  }
  const isConsumer = (p) => p && (p.kind === "user" || p.kind === "agent");
  const actorRef = (p) => (!p ? { kind: "public" } : p.kind === "agent" ? { kind: "agent", client_id: p.client_id } : p.kind === "user" ? { kind: "user", subject_ref: subjectRef(p.subject_id) } : p.kind === "operator" ? { kind: "operator", operator_id: p.operator_id } : { kind: p.kind, organization_id: p.organization_id });
  const subjectRef = (s) => "subj_" + hmac(subjectSecret, s).slice(0, 22); // pseudonymous, stable per host, not reversible without the host secret

  // ---------- the 2.0-draft lifecycle host, called in-process with the caller's own token ----------
  async function v2call(p, method, path, body, idem) {
    const headers = { ...(p?.token ? { authorization: p.token } : {}), ...(idem ? { "idempotency-key": idem } : {}) };
    const r = await v2.handle(method, path, headers, body == null ? null : structuredClone(body));
    const out = r.body == null ? null : JSON.parse(JSON.stringify(r.body));
    if (r.status >= 400) throw fromV2(r.status, out);
    return { status: r.status, body: out };
  }
  const v2obj = (id) => v2.state.objects.get(id);

  // ---------- workflows and the signed journal ----------
  function workflowFor(p, workflow_id) {
    const wf = store.workflows.get(workflow_id);
    if (!wf || !isConsumer(p) || p.subject_id !== wf.owner_subject_id) fail("NOT_FOUND"); // masked: no existence leak across tenants
    return wf;
  }
  const journal = (wfId) => store.journals.get(wfId) || [];
  function head(wfId) { const j = journal(wfId); const last = j.at(-1); return { sequence: last?.sequence ?? 0, digest: last?.event_digest ?? ZERO_DIGEST }; }
  function append(wf, { event_type, actor, authority_ref = null, payload = {}, source = "olip_3_layer", v2_ref = null, idempotency_key = null, privacy_scope = "participant_minimum" }) {
    const j = journal(wf.workflow_id); store.journals.set(wf.workflow_id, j);
    const env = { olip_version: V3, event_id: `urn:olip:v3:${hostLabel}:evt:${wf.workflow_id}:${j.length + 1}`, workflow_id: wf.workflow_id, sequence: j.length + 1, event_type, schema_version: V3, recorded_at: iso(),
      actor_type: actor.type, actor_ref: actor.ref ?? null, authority_ref, source, v2_ref, payload_digest: digestOf(payload), payload, previous_event_digest: j.at(-1)?.event_digest ?? ZERO_DIGEST,
      policy_version: policy.policyVersion(), idempotency_key, privacy_scope, fictional: wf.fictional };
    env.event_digest = digestOf(env);
    const signed = signDetached(env, keys.events);
    j.push(signed);
    queueWebhooks(wf, signed);
    return signed;
  }
  function verifyJournal(entries) {
    let prev = ZERO_DIGEST;
    for (const e of entries) {
      const { signature, event_digest, ...rest } = e;
      if (e.previous_event_digest !== prev || digestOf(rest) !== event_digest) return { ok: false, broken_at_sequence: e.sequence };
      if (!verifyDetached(e, [keys.events.publicJwk]).ok) return { ok: false, bad_signature_at_sequence: e.sequence };
      prev = event_digest;
    }
    return { ok: true, length: entries.length, statement: "Hash chain and Ed25519 signatures check out for this host's journal. Not an independently audited ledger." };
  }
  // Mirrors new 2.0-draft lifecycle journal entries for the matter into the 3.0 journal (references only, no content).
  function syncLifecycle(wf) {
    const src = v2.state.journals.get(wf.matter_id) || [];
    let changed = false;
    for (const e of src) {
      if (e.seq <= wf.v2_mirrored_seq) continue;
      const role = e.event.actor?.role;
      const actor = role === "firm" ? { type: "firm_authorized_actor", ref: { organization_id: e.event.actor.organization_id, actor_id: e.event.actor.actor_id } }
        : role === "consumer" ? { type: "user", ref: null } : { type: "lifecycle_host", ref: { operator_id: e.event.actor?.organization_id ?? null } };
      append(wf, { event_type: `lifecycle.${e.event.event_type}`, actor, source: "olip_2_0_draft_lifecycle", authority_ref: role === "firm" ? e.event.signature?.kid ?? null : null,
        v2_ref: { seq: e.seq, entry_hash: e.entry_hash, event_id: e.event.event_id, signer_kid: e.event.signature?.kid ?? null, attribution_at_mirror: role === "firm" ? "firm_signed_verified_by_2_0_host" : "host_attested",
          object: e.event.object }, payload: { object_type: e.event.object?.type ?? null } });
      wf.v2_mirrored_seq = e.seq; changed = true;
    }
    if (changed) store.commit();
  }
  const cursorFor = (wfId, seq) => { const b = Buffer.from(JSON.stringify({ w: wfId, s: seq })).toString("base64url"); return `c1.${b}.${hmac(cursorSecret, b).slice(0, 22)}`; };
  function readCursor(wfId, c) {
    const m = /^c1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]{22})$/.exec(String(c));
    if (!m || !sameBytes(hmac(cursorSecret, m[1]).slice(0, 22), m[2])) fail("SCHEMA_INVALID", "The cursor is not one this host issued.");
    const v = JSON.parse(Buffer.from(m[1], "base64url").toString("utf8"));
    if (v.w !== wfId) fail("SCHEMA_INVALID", "The cursor belongs to a different workflow.");
    return v.s;
  }

  // ---------- consent checks before any disclosure (defense in depth; the 2.0 host checks again, atomically) ----------
  function approvalCheck(p, { grant_id, grant_digest }, { matter_id, organization_id }) {
    const g = v2.state.grants.get(grant_id);
    const no = (reason_code, missing = [], decision = "deny") => ({ ok: false, reason_code, missing, decision });
    if (!g || g.subject_id !== p.subject_id) return no("USER_APPROVAL_REQUIRED", ["user_approval_on_approval_page"], "require_user_approval");
    if (g.state === "pending") return no("USER_APPROVAL_REQUIRED", ["user_decision_on_approval_page"], "require_user_approval");
    if (g.state === "denied") return no("USER_APPROVAL_REQUIRED", ["new_user_approval"], "require_user_approval");
    if (g.state === "revoked") return no("GRANT_REVOKED", ["new_user_approval"]);
    if (g.matter_id !== matter_id || (organization_id && g.recipient?.organization_id !== organization_id)) return no("RECIPIENT_MISMATCH");
    if (g.state !== "active" || Date.parse(g.expires_at) <= nowMs() || g.uses >= g.max_uses) return no("GRANT_EXPIRED", ["new_user_approval"]);
    if (!safeEqual(String(grant_digest || ""), g.grant_digest)) return no("DIGEST_MISMATCH", ["approval_for_current_content"]);
    return { ok: true, grant: { grant_id: g.grant_id, recipient: g.recipient.organization_id, grant_digest: g.grant_digest, expires_at: g.expires_at } };
  }
  const grantState = (grant_id) => { const g = v2.state.grants.get(grant_id); if (!g) return "missing"; if (g.state === "active" && (Date.parse(g.expires_at) <= nowMs() || g.uses >= g.max_uses)) return "expired"; return g.state; };

  // ---------- webhooks (hints only; signed; SSRF-checked at subscribe AND at every delivery) ----------
  const timers = new Set();
  let closed = false;
  function queueWebhooks(wf, entry) {
    for (const s of store.subscriptions.values()) {
      if (!s.active || s.workflow_id !== wf.workflow_id) continue;
      const body = signDetached({ olip_version: V3, webhook_id: newId("whk"), subscription_id: s.subscription_id, workflow_id: wf.workflow_id, event_sequence: entry.sequence, event_type: entry.event_type,
        event_digest: entry.event_digest, sent_at: iso(), statement: "Hint only. Contains no case content. Read the workflow before acting. Deduplicate on webhook_id." }, keys.events);
      const rec = { webhook_id: body.webhook_id, subscription_id: s.subscription_id, workflow_id: wf.workflow_id, event_sequence: entry.sequence, body, attempts: [], status: "pending" };
      store.webhooks.set(rec.webhook_id, rec);
      attempt(rec);
    }
  }
  async function attempt(rec) {
    const s = store.subscriptions.get(rec.subscription_id);
    if (!s?.active) { rec.status = "subscription_revoked"; return; }
    const chk = await checkCallbackUrl(s.callback_url, { allowLoopbackForTests: allowLoopbackCallbacksForTests });
    let outcome;
    if (!chk.ok) outcome = "blocked_" + chk.reason;
    else {
      try {
        const r = await fetch(s.callback_url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(WH.timeoutMs), headers: { "content-type": "application/json", "olip-webhook-id": rec.webhook_id }, body: JSON.stringify(rec.body) });
        outcome = r.status >= 300 && r.status < 400 ? "redirect_refused" : r.ok ? "delivered" : `receiver_status_${r.status}`;
      } catch { outcome = "network_error"; }
    }
    rec.attempts.push({ at: new Date().toISOString(), outcome });
    if (outcome === "delivered" || outcome.startsWith("blocked_") || outcome === "redirect_refused") { rec.status = outcome; store.commit(); return; }
    if (rec.attempts.length >= WH.maxAttempts) { rec.status = "dead_letter"; store.commit(); return; }
    rec.status = "retrying";
    // Exponential backoff with full jitter: base * 2^(n-1) * random[0.5, 1).
    const delay = Math.round(WH.baseDelayMs * 2 ** (rec.attempts.length - 1) * (0.5 + Math.random() / 2));
    const t = setTimeout(() => { timers.delete(t); if (!closed) attempt(rec); }, delay); t.unref?.(); timers.add(t);
  }

  // ---------- capsules ----------
  function checkCapsule(c, { requireLocalRecord = false } = {}) {
    const problems = [];
    if (!c || typeof c !== "object") return { ok: false, problems: ["not_an_object"] };
    if (!validateCapsuleShape(c)) problems.push(...validateCapsuleShape.errors.slice(0, 5).map((e) => `schema:${e.instancePath || "/"} ${e.message}`));
    const { signature, capsule_digest, ...body } = c;
    if (capsule_digest !== digestOf(body)) problems.push("capsule_digest_mismatch");
    const issuerKeys = [keys.capsules.publicJwk, ...trustedCapsuleIssuers];
    const v = verifyDetached(c, issuerKeys);
    if (!v.ok) problems.push("signature_" + v.reason);
    if (!(Date.parse(c.expires_at) > nowMs())) problems.push("expired");
    if (c.export_authorization?.onward_disclosure !== false || (c.export_authorization?.authorizes_recipients || []).length) problems.push("capsule_claims_disclosure_authority");
    const local = store.capsules.get(c.capsule_id);
    if (local?.revoked) problems.push("revoked");
    if (requireLocalRecord && !local) problems.push("not_issued_by_this_host");
    return { ok: problems.length === 0, problems, issuer_kid: c.signature?.kid ?? null, encrypted: c.encryption?.status === "recipient_key" };
  }

  // ---------- manifest ----------
  function manifest() {
    const body = { olip_version: V3, manifest_version: V3, release_status: RELEASE_STATUS, statement: RELEASE_STATEMENT,
      provider_id: `urn:olip:host:${hostLabel}`, issuer: `urn:olip:host:${hostLabel}`, endpoint_origin: "same-origin",
      supported_olip_versions: [...(combinedWith10 ? ["0.1", "0.2"] : []), V2_WIRE, V3], extension_id: V3_EXTENSION, profile: PROFILE,
      profiles: [
        { id: "discovery", provided_by: "olip-lifecycle-core/2" }, { id: "intake", provided_by: "olip-lifecycle-core/2" }, { id: "consultation", provided_by: "olip-consultation/2" },
        { id: "engagement", provided_by: "olip-engagement/2" }, { id: "communications", provided_by: "olip-communications/2" }, { id: "matter_lifecycle", provided_by: "olip-matter/2" },
        { id: "agent_continuity", provided_by: PROFILE }],
      transport_bindings: {
        https: { base_path: "/olip/v3", openapi_url: "/olip/v3/openapi.json", invoke: "POST /olip/v3/actions/{action_id}/invoke", version_header: "OLIP-Version" },
        mcp: { adapter: "adapters/mcp/server.mjs", sdk: `@modelcontextprotocol/sdk ${MCP_SDK}`, protocol_versions: "as negotiated by the pinned SDK (latest 2025-11-25)", note: "The pinned official SDK does not offer MCP 2026-07-28; see docs/COMPATIBILITY_MATRIX.md." },
        a2a: { adapter: "adapters/a2a/agent.mjs", sdk: `@a2a-js/sdk ${A2A_SDK}`, protocol_version: "1.0", agent_card_path: "/.well-known/agent-card.json (on the adapter)" } },
      actions: ACTIONS.map(contractOf), effects: EFFECT_MEANING,
      policy: policy.publicSummary(), status_semantics: STATUS_SEMANTICS,
      approval: { user_approval_methods: ["hosted_otp_mock (2.0-draft approval page)", "signed_in_user_session (capsule export and import authorization)"], approval_is_model_callable: false },
      neutrality: { discovery_ordering: "display_name_alphabetical", paid_influence: false, sponsor_services_required: false, sponsor_account_required: false },
      privacy: { manifest_contains_case_data: false, logs: "route, status and error code only", capsule_encryption: "optional, to one receiving assistant's X25519 key; not end-to-end between people", retention: "Mock: in memory or a local snapshot file. No production retention policy exists." },
      keys_url: "/olip/v3/keys", errors_url: "/olip/v3/errors", schemas_base: "/olip/v3/schemas/",
      mode, ...(mode === "mock" ? { fictional_data_only: true } : {}),
      max_age_seconds: 300, expires_at: plus(MANIFEST_TTL_S) };
    // The etag covers content only (not expires_at) so caches revalidate cheaply.
    const { expires_at, ...stable } = body;
    body.etag = digestOf(stable);
    return signDetached(body, keys.manifest);
  }

  // ---------- action handlers ----------
  const H = {};
  H["olip.get_capabilities"] = () => manifest();
  H["olip.find_professionals"] = async (p, a) => {
    const q = new URLSearchParams(); if (a.jurisdiction) q.set("jurisdiction", a.jurisdiction); if (a.matter_type) q.set("matter", a.matter_type);
    const r = (await v2call(null, "GET", `/olip/v2/recipients?${q}`)).body;
    return { olip_version: V3, ordering: r.ordering, professionals: r.recipients.map((x) => ({ ...x, evidence: { source: "organization_signed_profile (2.0-draft firm endpoint)", as_of: iso(), verification: "host checked the organization's signed authority document" } })),
      statement: "Listed alphabetically. Payment never affects inclusion or order. This host does not recommend or rank any organization; the user chooses." };
  };
  H["olip.get_recipient_policy"] = async (p, a) => {
    const r = (await v2call(null, "GET", `/olip/v2/recipients/${encodeURIComponent(a.organization_id)}/intake-questions?stage=${a.stage || "screening"}`)).body;
    return { olip_version: V3, organization_id: a.organization_id, stage: r.stage, fields: r.fields, statement: r.statement ?? null, lifecycle_profiles: ["olip-lifecycle-core/2", "olip-consultation/2", "olip-engagement/2", "olip-communications/2", "olip-matter/2"] };
  };
  H["olip.prepare_casebrief"] = (p, a) => {
    const cb = a.casebrief; const text = JSON.stringify(cb);
    const paths = leafPaths(cb);
    const sensitive = { screening: sensitiveFindings(text, "screening"), casebrief: sensitiveFindings(text, "casebrief") };
    const missing = ["prospective_client.name", "adverse_parties", "matter.category", "matter.jurisdiction"].filter((x) => getPath(cb, x) === undefined);
    return { olip_version: V3, casebrief_digest: digestOf(cb), field_paths: paths, missing_for_screening: missing, sensitive_findings: sensitive,
      instruction_like_text: injectionFindings(text).length ? { found: true, handling: "Kept as user content and treated as data. It changes nothing about who may approve or receive anything." } : { found: false },
      transmitted: false, stored: false, statement: "Checked locally. Nothing was sent or stored." };
  };
  H["olip.start_workflow"] = async (p, a, c) => {
    const r = (await v2call(p, "POST", "/olip/v2/matters", { casebrief: a.casebrief, fictional: a.fictional !== false }, `v3:${c.idem}`)).body;
    const m = r.matter;
    const wf = { workflow_id: newId("wf"), matter_id: m.matter_id, owner_subject_id: p.subject_id, jurisdiction: m.jurisdiction, fictional: m.fictional, created_at: iso(), created_by: actorRef(p), v2_mirrored_seq: 0 };
    store.workflows.set(wf.workflow_id, wf);
    append(wf, { event_type: "workflow.created", actor: { type: p.kind === "agent" ? "ai_host" : "user", ref: actorRef(p) }, payload: { matter_ref: "2.0-draft matter (id in workflow record)" }, idempotency_key: c.idem });
    syncLifecycle(wf);
    return workflowView(p, wf);
  };
  async function workflowView(p, wf) {
    syncLifecycle(wf);
    const m = (await v2call(p, "GET", `/olip/v2/matters/${wf.matter_id}`)).body.matter;
    const discl = [...store.disclosures.values()].filter((d) => d.workflow_id === wf.workflow_id).map(disclosureView);
    return { olip_version: V3, workflow: { workflow_id: wf.workflow_id, matter_id: wf.matter_id, fictional: wf.fictional, jurisdiction: wf.jurisdiction, created_at: wf.created_at,
      head: head(wf.workflow_id), lifecycle: m.status, represented: m.represented, disclosures: discl,
      casebrief: m.casebrief ? { revision: m.casebrief.revision, content_visible_to_caller: m.casebrief.content != null } : null },
      status_semantics: STATUS_SEMANTICS, statement: "Lifecycle states come from the 2.0-draft host's status of record. Repeat each meaning exactly; do not infer more." };
  }
  const disclosureView = (d) => ({ disclosure_id: d.disclosure_id, organization_id: d.organization_id, stage: d.stage, fields: d.fields, state: d.state, approval: { approval_id: d.approval.approval_id, approval_url: d.approval.approval_url, grant_id: d.approval.grant_id, grant_digest: d.approval.grant_digest, expires_at: d.approval.expires_at },
    delivery: d.delivery ?? null, created_at: d.created_at });
  H["olip.get_workflow"] = async (p, a) => workflowView(p, workflowFor(p, a.workflow_id));
  H["olip.list_workflow_events"] = async (p, a) => {
    const wf = workflowFor(p, a.workflow_id); syncLifecycle(wf);
    const j = journal(wf.workflow_id);
    const after = a.cursor ? readCursor(wf.workflow_id, a.cursor) : 0;
    if (after > j.length) fail("EVENT_CURSOR_GAP", "The cursor is ahead of this journal. Restart from your last verified cursor.", { journal_length: j.length });
    if (a.last_seen_digest && (after === 0 ? ZERO_DIGEST : j[after - 1].event_digest) !== a.last_seen_digest) fail("EVENT_CURSOR_GAP", "last_seen_digest does not match the event at this cursor.", { at_sequence: after });
    const limit = a.limit ?? 50;
    const entries = j.slice(after, after + limit);
    const last = after + entries.length;
    return { olip_version: V3, workflow_id: wf.workflow_id, entries, next_cursor: cursorFor(wf.workflow_id, last), has_more: last < j.length, head: head(wf.workflow_id), chain: verifyJournal(j), keys_url: "/olip/v3/keys" };
  };
  H["olip.preview_disclosure"] = async (p, a, c) => {
    const wf = workflowFor(p, a.workflow_id);
    let r, v2ref;
    if (a.stage === "screening") { r = (await v2call(p, "POST", `/olip/v2/matters/${wf.matter_id}/conflict-screens`, { organization_id: a.organization_id, fields: a.fields, selection: { by: "user" } }, `v3:${c.idem}`)).body; v2ref = { kind: "conflict_screen", conflict_screen_id: r.conflict_screen.id }; }
    else { r = (await v2call(p, "POST", `/olip/v2/matters/${wf.matter_id}/disclosures`, { organization_id: a.organization_id, fields: a.fields }, `v3:${c.idem}`)).body; v2ref = { kind: "casebrief", conflict_screen_id: r.conflict_screen_id }; }
    const d = { disclosure_id: newId("dis"), workflow_id: wf.workflow_id, organization_id: a.organization_id, stage: a.stage, fields: a.fields, v2: v2ref, state: "awaiting_user_approval", created_at: iso(), created_by: actorRef(p),
      approval: { approval_id: r.approval.approval_id, approval_url: r.approval.approval_url, grant_id: r.approval.grant_id, grant_digest: r.approval.grant_digest, expires_at: r.approval.expires_at } };
    store.disclosures.set(d.disclosure_id, d);
    append(wf, { event_type: "disclosure.prepared", actor: { type: p.kind === "agent" ? "ai_host" : "user", ref: actorRef(p) }, payload: { disclosure_id: d.disclosure_id, organization_id: d.organization_id, stage: d.stage, fields: d.fields, grant_digest: d.approval.grant_digest }, idempotency_key: c.idem });
    return { olip_version: V3, disclosure: disclosureView(d), sent: false,
      next: "Show the user the approval page. Only the user can approve, there, with a code sent to their own contact. Then call olip.submit_approved_disclosure with this disclosure_id, grant_id and grant_digest.",
      statement: "Nothing was sent. The approval is bound to this one organization, these exact field values, this purpose and an expiry. Any change needs a new approval." };
  };
  H["olip.submit_approved_disclosure"] = async (p, a, c) => {
    const d = store.disclosures.get(a.disclosure_id);
    const wf = d && store.workflows.get(d.workflow_id);
    if (!d || !wf || !isConsumer(p) || wf.owner_subject_id !== p.subject_id) fail("NOT_FOUND");
    if (d.state === "cancelled") fail("CONFLICTING_STATE", "This request was cancelled. Prepare a new one.");
    if (d.state === "submitted") fail("CONFLICTING_STATE", "Already sent. Read the workflow for its delivery state.");
    if (a.grant_id !== d.approval.grant_id) fail("RECIPIENT_MISMATCH", "This approval belongs to a different request.");
    // Recheck immediately before the side effect (time-of-check to time-of-use). The 2.0 host checks again, atomically.
    const pre = approvalCheck(p, a, { matter_id: wf.matter_id, organization_id: d.organization_id });
    const dec = policy.decide({ principal: p, action: ACTION_BY_ID["olip.submit_approved_disclosure"], jurisdiction: wf.jurisdiction, fictional: wf.fictional, approval: pre });
    c.decision = dec;
    if (dec.decision !== "allow") fail(dec.reason_code, undefined, { decision: dec.decision, missing: dec.missing, policy_version: dec.policy_version });
    const body = { grant_id: a.grant_id, grant_digest: a.grant_digest };
    let r;
    try {
      r = d.stage === "screening" ? (await v2call(p, "POST", `/olip/v2/conflict-screens/${d.v2.conflict_screen_id}/submit`, body, `v3:${c.idem}`)).body
        : (await v2call(p, "POST", `/olip/v2/matters/${wf.matter_id}/disclosures/submit`, body, `v3:${c.idem}`)).body;
    } catch (e) { syncLifecycle(wf); throw e; }
    d.state = "submitted"; d.delivery = { state: r.delivery.state, receipt_id: r.delivery.receipt?.receipt_id ?? null, receipt_kid: r.delivery.receipt?.signature?.kid ?? null };
    append(wf, { event_type: "disclosure.submitted", actor: { type: p.kind === "agent" ? "ai_host" : "user", ref: actorRef(p) }, authority_ref: a.grant_id, payload: { disclosure_id: d.disclosure_id, organization_id: d.organization_id, delivery_state: d.delivery.state, grant_digest: a.grant_digest }, idempotency_key: c.idem });
    syncLifecycle(wf);
    return { olip_version: V3, disclosure: disclosureView(d), delivery: r.delivery, lifecycle_object: r.conflict_screen ? { type: "conflict_screen", id: r.conflict_screen.id, state: r.conflict_screen.state } : null,
      status_semantics: { delivery_state: STATUS_SEMANTICS.find((x) => x.state === "delivered_to_endpoint"), tool_success: STATUS_SEMANTICS.find((x) => x.state === "tool_call_succeeded") } };
  };
  H["olip.cancel_pending_request"] = async (p, a, c) => {
    const d = store.disclosures.get(a.disclosure_id); const wf = d && store.workflows.get(d.workflow_id);
    if (!d || !wf || !isConsumer(p) || wf.owner_subject_id !== p.subject_id) fail("NOT_FOUND");
    if (d.state === "submitted") fail("CONFLICTING_STATE", "Already sent. Cancelling cannot undo a delivered disclosure. The organization may keep what it received under its own duties.");
    if (d.state !== "cancelled") { d.state = "cancelled"; d.cancelled_at = iso(); append(wf, { event_type: "disclosure.cancelled", actor: { type: p.kind === "agent" ? "ai_host" : "user", ref: actorRef(p) }, payload: { disclosure_id: d.disclosure_id }, idempotency_key: c.idem }); }
    return { olip_version: V3, disclosure: disclosureView(d), statement: "Cancelled before sending. The user's approval for it can no longer be used through this layer." };
  };
  H["olip.plan_next_actions"] = async (p, a) => {
    const wf = workflowFor(p, a.workflow_id); syncLifecycle(wf);
    if (a.known_event_cursor) readCursor(wf.workflow_id, a.known_event_cursor);
    const m = (await v2call(p, "GET", `/olip/v2/matters/${wf.matter_id}`)).body.matter;
    return planNextActions({ workflow_id: wf.workflow_id, head: head(wf.workflow_id), principal_kind: p.kind, lifecycle: m.status, goal: a.desired_goal,
      disclosures: [...store.disclosures.values()].filter((d) => d.workflow_id === wf.workflow_id), grantState,
      writeGate: (effect) => policy.jurisdictionGate(wf.jurisdiction, effect)?.reason_code ?? null, policy_version: policy.policyVersion() });
  };
  H["olip.export_context_capsule"] = async (p, a, c) => {
    const wf = workflowFor(p, a.workflow_id); syncLifecycle(wf);
    const m = (await v2call(p, "GET", `/olip/v2/matters/${wf.matter_id}`)).body.matter;
    const cb = m.casebrief.content; const all = leafPaths(cb);
    for (const f of a.include_fields) if (!FIELD_PATH.test(f) || getPath(cb, f) === undefined) fail("SCHEMA_INVALID", `Field ${f} is not in the CaseBrief.`, { field: f });
    const inc = (path) => a.include_fields.some((f) => path === f || path.startsWith(f + "."));
    const observed = m.updated_at;
    const assertions = [];
    let n = 0; const cid = () => `claim_${String(++n).padStart(3, "0")}`;
    for (const f of [...a.include_fields].sort()) {
      const value = getPath(cb, f); const text = JSON.stringify(value);
      if (sensitiveFindings(text, "message").some((x) => x.blocked)) fail("SENSITIVE_DATA_BLOCKED", `Field ${f} looks like a credential and cannot go in a capsule.`, { field: f });
      assertions.push({ claim_id: cid(), field_path: f, value, origin_type: "user_reported", source_ref: `casebrief_revision_${m.casebrief.revision}`, observed_at: observed, verified_at: null, jurisdiction: wf.jurisdiction,
        extraction_method: "user_entered", confidence_or_uncertainty: "unknown", verification_status: "unverified", supersedes_claim_id: null, access_classification: "client_confidential", content_digest: digestOf(value),
        untrusted_text_flags: injectionFindings(text) });
    }
    // Firm-signed lifecycle facts, derived by the host from signature-verified 2.0-draft events (never from a caller).
    for (const e of journal(wf.workflow_id).filter((x) => x.actor_type === "firm_authorized_actor")) {
      assertions.push({ claim_id: cid(), field_path: `lifecycle.${e.v2_ref.object.type}.${e.v2_ref.object.id}`, value: e.event_type.replace(/^lifecycle\./, ""), origin_type: "firm_asserted", source_ref: e.v2_ref.event_id,
        observed_at: e.recorded_at, verified_at: e.recorded_at, jurisdiction: wf.jurisdiction, extraction_method: "signed_lifecycle_event", confidence_or_uncertainty: "not_applicable",
        verification_status: "signature_verified_by_2_0_host", supersedes_claim_id: null, access_classification: "client_confidential", content_digest: e.payload_digest, untrusted_text_flags: [] });
    }
    const conflicts = [];
    for (const ai of a.ai_interpretations || []) {
      const claim = { claim_id: cid(), field_path: ai.field_path, value: ai.value, origin_type: "ai_interpretation", source_ref: "exporting_assistant_note", observed_at: iso(), verified_at: null, jurisdiction: wf.jurisdiction,
        extraction_method: "model_output_supplied_by_user", confidence_or_uncertainty: "unknown", verification_status: "not_verified", supersedes_claim_id: null, access_classification: "client_confidential", content_digest: digestOf(ai.value),
        untrusted_text_flags: injectionFindings(JSON.stringify(ai.value)), note: ai.note ?? null };
      assertions.push(claim);
      const other = assertions.find((x) => x.field_path === ai.field_path && x.origin_type !== "ai_interpretation");
      if (other && canonicalize(other.value) !== canonicalize(ai.value)) conflicts.push({ field_path: ai.field_path, claim_ids: [other.claim_id, claim.claim_id], resolution: "unresolved", statement: "Kept as separate claims. Neither replaces the other." });
    }
    const dates = inc("facts.key_dates") ? (getPath(cb, "facts.key_dates") || []) : [];
    const docs = [...v2.state.objects.values()].filter((o) => o.type === "document" && o.matter_id === wf.matter_id && o.scan?.status === "clean" && o.uploader?.kind !== "firm")
      .map((o) => ({ document_id: o.id, sha256: o.sha256, mime: o.mime, access_scope: "requires_a_fresh_download_authorization_from_the_holding_host", content_included: false }));
    const exp = Math.min(Date.parse(plus(a.expires_in_seconds ?? CAPSULE_TTL_S)), Date.parse(plus(30 * 86400)));
    const content = { assertions, conflicts, unresolved_questions: (a.unresolved_questions || []).map((t, i) => ({ question_id: `q_${String(i + 1).padStart(3, "0")}`, text: t, origin_type: "user_reported" })),
      time_sensitive_fields: dates.map((d) => ({ field_path: "facts.key_dates", description: d.description ?? null, value: d.date ?? null, timezone: d.timezone ?? null, origin_type: "user_reported", verification_status: "unverified", calculation: null,
        statement: "A date the user reported. Not a computed or verified legal deadline." })),
      document_refs: docs };
    const h = head(wf.workflow_id);
    const body = { olip_version: V3, document: "legal_context_capsule", capsule_version: V3, capsule_id: newId("cap"), matter_ref: wf.workflow_id, subject_ref: subjectRef(wf.owner_subject_id),
      controller: { kind: "user", note: "The user controls this export. The host that issued it is named in issuer." }, issuer: `urn:olip:host:${hostLabel}`, fictional: wf.fictional,
      created_at: iso(), expires_at: new Date(exp).toISOString(),
      source_provenance: { origin: "olip_3_0_draft_reference_host", method: "user_initiated_export", casebrief_revision: m.casebrief.revision, as_of_event_sequence: h.sequence, as_of_event_digest: h.digest },
      included_fields: [...a.include_fields].sort(), excluded_fields: all.filter((x) => !inc(x)).sort().map((x) => ({ path: x, reason: "not_selected_by_user" })),
      workflow_snapshot: { as_of: iso(), as_of_event_sequence: h.sequence, as_of_event_digest: h.digest, lifecycle: m.status, pending_user_approvals: [...store.disclosures.values()].filter((d) => d.workflow_id === wf.workflow_id && d.state === "awaiting_user_approval").length,
        authoritative_sources: { lifecycle_states: "the 2.0-draft host's status of record", firm_states: "firm-signed events" } },
      export_authorization: { authorized_by: "signed_in_user_session", purpose: a.purpose, originating_system: `urn:olip:host:${hostLabel}`, expires_at: new Date(exp).toISOString(), onward_disclosure: false, authorizes_recipients: [],
        new_host_access: "Requires a separate import authorization from the user for one named assistant.", statement: "This capsule is not consent to contact or send anything to any organization." },
      intended_host: a.intended_host ? { client_id: a.intended_host.client_id } : null,
      retention: { expires_at: new Date(exp).toISOString(), revocation: "The user can revoke it on the issuing host; imports and reads there stop. Copies already taken elsewhere cannot be recalled.",
        deletion: "Mock host: in memory or a local snapshot file.", legal_hold_caveat: "Organizations that already received information keep it under their own legal duties." },
      excludes: ["model_chain_of_thought", "raw_chat_transcripts", "session_identifiers", "credentials", "unselected_casebrief_fields", "document_contents"],
      schema_ref: SCHEMAS["context-capsule"].$id };
    if (a.intended_host?.encryption_key) {
      const k = a.intended_host.encryption_key;
      if (k.kty !== "OKP" || k.crv !== "X25519" || typeof k.x !== "string" || !k.kid) fail("SCHEMA_INVALID", "encryption_key must be an X25519 public JWK with a kid.");
      body.encryption = { status: "recipient_key", alg: "ECDH-ES+HKDF-SHA256/A256GCM", recipient_kid: k.kid, content_digest: digestOf(content),
        statement: "Content is encrypted to one assistant's key. The issuing host saw the plaintext when it built the capsule. This is not end-to-end encryption between people." };
      body.sealed_content = sealToRecipient(canonicalize(content), k, `${body.capsule_id}|${body.olip_version}`);
    } else { body.encryption = { status: "none", statement: "Not encrypted. Signed for integrity only. Protect the file like any confidential document." }; body.content = content; }
    body.capsule_digest = digestOf(body);
    const cap = signDetached(body, keys.capsules);
    store.capsules.set(cap.capsule_id, { capsule_id: cap.capsule_id, capsule_digest: cap.capsule_digest, owner_subject_id: wf.owner_subject_id, workflow_id: wf.workflow_id, expires_at: cap.expires_at, revoked: false, intended_client_id: a.intended_host?.client_id ?? null });
    append(wf, { event_type: "capsule.exported", actor: { type: "user", ref: actorRef(p) }, payload: { capsule_id: cap.capsule_id, capsule_digest: cap.capsule_digest, included_field_count: a.include_fields.length, encrypted: body.encryption.status !== "none" }, idempotency_key: c.idem });
    return { olip_version: V3, capsule: cap, transmitted: false, statement: "Exported for you. It was not sent anywhere and it authorizes no one." };
  };
  H["olip.validate_context_capsule"] = (p, a) => ({ olip_version: V3, ...checkCapsule(a.capsule), stored: false });
  H["olip.authorize_capsule_import"] = (p, a, c) => {
    const rec = store.capsules.get(a.capsule_id);
    if (!rec || rec.owner_subject_id !== p.subject_id) fail("NOT_FOUND");
    if (rec.revoked) fail("GRANT_REVOKED", "This capsule was revoked.");
    if (Date.parse(rec.expires_at) <= nowMs()) fail("GRANT_EXPIRED", "This capsule has expired.");
    if (!safeEqual(a.capsule_digest, rec.capsule_digest)) fail("DIGEST_MISMATCH", "capsule_digest does not match the capsule you exported.");
    if (!AGENT_CLIENTS[a.client_id]) fail("SCHEMA_INVALID", "Unknown assistant client_id.");
    if (rec.intended_client_id && rec.intended_client_id !== a.client_id) fail("RECIPIENT_MISMATCH", "This capsule was exported for a different assistant.");
    const auth = signDetached({ olip_version: V3, import_authorization_id: newId("iau"), capsule_id: rec.capsule_id, capsule_digest: rec.capsule_digest, client_id: a.client_id, subject_ref: subjectRef(p.subject_id),
      authorized_by: "signed_in_user_session", created_at: iso(), expires_at: plus(a.expires_in_seconds ?? IMPORT_AUTH_TTL_S), nonce: randomBytes(16).toString("base64url"), max_uses: 1,
      scope: ["read_imported_capsule"], authorizes_recipients: [], statement: "Lets this one assistant import this one capsule. It does not let the assistant contact or send anything to anyone." }, keys.capsules);
    store.importAuthorizations.set(auth.import_authorization_id, { ...auth, owner_subject_id: p.subject_id, uses: 0, revoked: false });
    const wf = store.workflows.get(rec.workflow_id);
    append(wf, { event_type: "capsule.import_authorized", actor: { type: "user", ref: actorRef(p) }, payload: { capsule_id: rec.capsule_id, client_id: a.client_id, import_authorization_id: auth.import_authorization_id }, idempotency_key: c.idem });
    return { olip_version: V3, import_authorization: auth };
  };
  H["olip.import_context_capsule"] = (p, a, c) => {
    const ia = store.importAuthorizations.get(a.import_authorization_id);
    if (!ia || ia.owner_subject_id !== p.subject_id) fail("USER_APPROVAL_REQUIRED", "The user has not authorized this assistant to import this capsule.", { missing: ["user_import_authorization"] });
    if (ia.client_id !== p.client_id) fail("RECIPIENT_MISMATCH", "The user authorized a different assistant.");
    if (ia.revoked) fail("GRANT_REVOKED");
    if (ia.uses >= ia.max_uses) fail("REPLAY_DETECTED", "This import authorization was already used.");
    if (Date.parse(ia.expires_at) <= nowMs()) fail("GRANT_EXPIRED", "The import authorization has expired. Ask the user again.");
    const chk = checkCapsule(a.capsule, { requireLocalRecord: true });
    if (!chk.ok) fail(chk.problems.includes("revoked") ? "GRANT_REVOKED" : chk.problems.includes("expired") ? "GRANT_EXPIRED" : "CAPSULE_INVALID", undefined, { problems: chk.problems });
    if (a.capsule.capsule_id !== ia.capsule_id || !safeEqual(a.capsule.capsule_digest, ia.capsule_digest)) fail("DIGEST_MISMATCH", "This is not the capsule the user authorized.");
    if (a.capsule.intended_host && a.capsule.intended_host.client_id !== p.client_id) fail("RECIPIENT_MISMATCH", "The capsule was exported for a different assistant.");
    ia.uses++;
    const grantsBefore = v2.state.grants.size;
    const imp = { import_id: newId("imp"), capsule_id: a.capsule.capsule_id, client_id: p.client_id, owner_subject_id: p.subject_id, state: "imported_limited", imported_at: iso(), capsule: a.capsule, import_authorization_id: ia.import_authorization_id };
    store.imports.set(`${p.client_id}:${imp.capsule_id}`, imp);
    const wf = store.workflows.get(store.capsules.get(imp.capsule_id).workflow_id);
    append(wf, { event_type: "capsule.imported", actor: { type: "ai_host", ref: actorRef(p) }, authority_ref: ia.import_authorization_id, payload: { capsule_id: imp.capsule_id, client_id: p.client_id }, idempotency_key: c.idem });
    return importView(imp, { grants_created: v2.state.grants.size - grantsBefore });
  };
  const importView = (imp, extra = {}) => ({ olip_version: V3, import: { import_id: imp.import_id, capsule_id: imp.capsule_id, client_id: imp.client_id, state: imp.state, imported_at: imp.imported_at },
    capsule: imp.capsule, grants_created: 0, authorizes_recipients: [], ...extra,
    statement: "Imported for reading only. No approval was created and nothing was sent. Contacting any organization, including a different firm, needs a new approval from the user." });
  H["olip.get_imported_capsule"] = (p, a) => {
    const imp = store.imports.get(`${p.client_id}:${a.capsule_id}`);
    if (!imp || imp.owner_subject_id !== p.subject_id) fail("NOT_FOUND");
    const rec = store.capsules.get(imp.capsule_id);
    if (rec?.revoked || imp.state === "revoked") fail("GRANT_REVOKED", "The user revoked this capsule.");
    if (Date.parse(imp.capsule.expires_at) <= nowMs()) { imp.state = "expired"; fail("GRANT_EXPIRED", "This capsule has expired."); }
    return importView(imp);
  };
  H["olip.revoke_context_capsule"] = (p, a, c) => {
    const rec = store.capsules.get(a.capsule_id);
    if (!rec || rec.owner_subject_id !== p.subject_id) fail("NOT_FOUND");
    if (!rec.revoked) {
      rec.revoked = true; rec.revoked_at = iso();
      for (const ia of store.importAuthorizations.values()) if (ia.capsule_id === rec.capsule_id) ia.revoked = true;
      for (const imp of store.imports.values()) if (imp.capsule_id === rec.capsule_id) imp.state = "revoked";
      append(store.workflows.get(rec.workflow_id), { event_type: "capsule.revoked", actor: { type: "user", ref: actorRef(p) }, payload: { capsule_id: rec.capsule_id }, idempotency_key: c.idem });
    }
    return { olip_version: V3, capsule_id: rec.capsule_id, revoked: true, revoked_at: rec.revoked_at, statement: "Future imports and reads on this host stop. Copies already taken elsewhere cannot be recalled." };
  };
  H["olip.subscribe_events"] = async (p, a, c) => {
    const wf = workflowFor(p, a.workflow_id);
    const chk = await checkCallbackUrl(a.callback_url, { allowLoopbackForTests: allowLoopbackCallbacksForTests });
    if (!chk.ok) fail("CALLBACK_URL_REJECTED", `Callback URL refused: ${chk.reason}.`, { reason: chk.reason });
    const s = { subscription_id: newId("sub"), workflow_id: wf.workflow_id, owner: actorRef(p), owner_subject_id: p.subject_id, callback_url: a.callback_url, active: true, created_at: iso() };
    store.subscriptions.set(s.subscription_id, s);
    return { olip_version: V3, subscription: subView(s) };
  };
  const subView = (s) => ({ subscription_id: s.subscription_id, workflow_id: s.workflow_id, active: s.active, created_at: s.created_at, cancelled_at: s.cancelled_at ?? null,
    verification: { keys_url: "/olip/v3/keys", alg: "EdDSA", max_skew_seconds: 300, dedupe_on: "webhook_id" }, delivery: { retries: WH.maxAttempts, backoff: "exponential with jitter", redirects: "never followed", fallback: "poll olip.list_workflow_events" } });
  H["olip.cancel_subscription"] = (p, a) => {
    const s = store.subscriptions.get(a.subscription_id);
    if (!s || !isConsumer(p) || s.owner_subject_id !== p.subject_id) fail("NOT_FOUND");
    if (s.active) { s.active = false; s.cancelled_at = iso(); }
    return { olip_version: V3, subscription: subView(s) };
  };
  H["olip.call_lifecycle"] = async (p, a, c) => {
    const wf = workflowFor(p, a.workflow_id);
    const spec = LIFECYCLE_OPERATIONS[a.operation];
    const rt = v2.routes.find((r) => r.opId === a.operation);
    if (!spec || !rt) fail("ACTION_NOT_SUPPORTED");
    let objectId = a.object_id;
    if (rt.path.startsWith("/olip/v2/matters/{id}")) objectId = wf.matter_id;
    else {
      const o = objectId && v2obj(objectId);
      const matterOf = o?.type === "message" ? v2obj(o.thread_id)?.matter_id ?? o.matter_id : o?.matter_id;
      if (!o || matterOf !== wf.matter_id) fail("NOT_FOUND"); // the object must belong to this workflow's matter
    }
    if (spec.effect === "external_disclosure") {
      const o = v2obj(objectId);
      const org = o?.organization_id ?? v2obj(o?.thread_id)?.organization_id ?? null;
      const pre = approvalCheck(p, { grant_id: a.body?.grant_id, grant_digest: a.body?.grant_digest }, { matter_id: wf.matter_id, organization_id: org });
      const dec = policy.decide({ principal: p, action: { ...ACTION_BY_ID["olip.call_lifecycle"], effect: "external_disclosure" }, jurisdiction: wf.jurisdiction, fictional: wf.fictional, approval: pre });
      c.decision = dec;
      if (dec.decision !== "allow") fail(dec.reason_code, undefined, { decision: dec.decision, missing: dec.missing, policy_version: dec.policy_version });
    }
    const path = rt.path.replace("{id}", encodeURIComponent(objectId));
    let r;
    try { r = (await v2call(p, rt.method, path, rt.method === "GET" ? null : (a.body ?? {}), rt.method === "GET" ? null : `v3:${c.idem}`)).body; }
    finally { syncLifecycle(wf); }
    return { olip_version: V3, operation: a.operation, lifecycle_v2_route: `${rt.method} ${rt.path}`, result: r, effect: spec.effect,
      ...(spec.prepares ? { next: spec.user_decides_on_page ? "Show the user the approval page. The user's decision there IS the response; there is nothing for you to submit." : "Show the user the approval page. Only the user can approve. Then call the matching submit step with grant_id and grant_digest." } : {}) };
  };
  const FIRM_PATHS = { conflict_screen: "/olip/v2/conflict-screens/{id}/events", consultation: "/olip/v2/consultations/{id}/events", engagement: "/olip/v2/engagements/{id}/events", message: "/olip/v2/messages/{id}/events",
    thread: "/olip/v2/threads/{id}/events", matter: "/olip/v2/matters/{id}/events", engagement_offer: "/olip/v2/matters/{id}/engagement-offers" };
  H["olip.record_firm_event"] = async (p, a, c) => {
    const o = v2obj(a.object_id);
    const matter = o ? (o.type === "matter" ? o : v2obj(o.matter_id)) : null;
    if (!matter) fail("NOT_FOUND");
    const g = policy.jurisdictionGate(matter.jurisdiction, "firm_authoritative");
    if (g) fail(g.reason_code, undefined, g.detail);
    const r = (await v2call(p, "POST", FIRM_PATHS[a.object_type].replace("{id}", encodeURIComponent(a.object_id)), { event: a.event }, `v3:${c.idem}`)).body;
    for (const wf of store.workflows.values()) if (wf.matter_id === matter.id) syncLifecycle(wf);
    return { olip_version: V3, operation: "record_firm_event", lifecycle_v2_route: `POST ${FIRM_PATHS[a.object_type]}`, result: r, effect: "firm_authoritative",
      statement: "The 2.0-draft host verified the organization's signer, role, scope, key and revision before recording this." };
  };
  H["olip.set_jurisdiction_policy"] = (p, a) => ({ olip_version: V3, ...policy.setJurisdiction(a.jurisdiction, { status: a.status, ...(a.reviewed_at ? { reviewed_at: a.reviewed_at } : {}), ...(a.review_by ? { review_by: a.review_by } : {}) }) });

  // ---------- the one entry point every binding calls ----------
  async function invoke({ headers = {}, actionId, input = {}, binding = "https", idempotencyKey = null, correlationId = null }) {
    const correlation_id = correlationId && /^[A-Za-z0-9_.:-]{1,100}$/.test(correlationId) ? correlationId : newId("cor");
    const a = ACTION_BY_ID[actionId];
    let p = null, decision = null, status = 200, out;
    const c = { idem: null, decision: null };
    try {
      if (!a) fail("ACTION_NOT_SUPPORTED");
      if (!a.transports.includes(binding)) fail("ACTION_NOT_SUPPORTED", `${a.id} is not offered through ${binding}.`);
      if (!inputValidators[a.id](input)) fail("SCHEMA_INVALID", "The input does not match the action's schema.", { errors: inputValidators[a.id].errors.slice(0, 5).map((e) => `${e.instancePath || "/"} ${e.message}`) });
      try { p = authenticate(headers); } catch (e) { if (!a.principals.includes("public")) throw e; p = null; } // public actions ignore bad tokens
      // Jurisdiction known up front for workflow-scoped writes (the handler re-checks the exact state at the side effect).
      const wf = input.workflow_id && isConsumer(p) ? store.workflows.get(input.workflow_id) : null;
      const jurisdiction = wf && wf.owner_subject_id === p.subject_id ? wf.jurisdiction : actionId === "olip.start_workflow" ? (input.casebrief?.matter?.jurisdiction ?? null) : undefined;
      const fictional = wf ? wf.fictional : actionId === "olip.start_workflow" ? input.fictional !== false : undefined;
      const effect = a.id === "olip.call_lifecycle" ? (LIFECYCLE_OPERATIONS[input.operation]?.effect ?? a.effect) : a.effect;
      decision = policy.decide({ principal: p, action: { ...a, effect }, jurisdiction, fictional, approval: effect === "external_disclosure" ? { ok: true } : undefined });
      if (decision.decision !== "allow") fail(decision.reason_code, undefined, { decision: decision.decision, missing: decision.missing, policy_version: decision.policy_version, ...(decision.detail ? { policy_detail: decision.detail } : {}) });
      if (a.mutating) {
        if (!idempotencyKey || !/^[A-Za-z0-9_.:-]{8,128}$/.test(idempotencyKey)) fail("IDEMPOTENCY_KEY_REQUIRED", "Send an Idempotency-Key of 8 to 128 characters (letters, digits, _ . : -).");
        const scope = `${p.kind}:${p.subject_id ?? p.organization_id ?? p.operator_id}:${p.client_id ?? "-"}:${a.id}:${idempotencyKey}`;
        c.idem = digestOf(scope).slice(7, 39);
        const prev = store.idempotency.get(scope);
        const bodyDigest = digestOf(input);
        if (prev) {
          if (prev.input_digest !== bodyDigest) fail("IDEMPOTENCY_CONFLICT");
          return finish({ status: prev.status, body: { ...prev.body, idempotent_replay: true }, a, p, decision, correlation_id, binding });
        }
        out = await H[a.id](p, input, c);
        store.idempotency.set(scope, { input_digest: bodyDigest, status: 200, body: out, at: iso() });
      } else out = await H[a.id](p, input, c);
      store.commit();
      return finish({ status, body: out, a, p, decision: c.decision || decision, correlation_id, binding });
    } catch (e) {
      const err = e instanceof OlipV3Error ? e : new OlipV3Error("INTERNAL", "Internal error in the reference host.");
      if (!(e instanceof OlipV3Error) && process.env.OLIP_DEBUG) console.error(e);
      return finish({ status: ERRORS[err.code].http, body: errorBody(err.code, err.message, { correlation_id, details: err.details }), a, p, decision: c.decision || decision, correlation_id, binding, error: err.code });
    }
  }
  function finish({ status, body, a, p, decision, correlation_id, binding, error = null }) {
    // Audit: who, what, decision, reason, policy version. Never inputs, case content, tokens or codes.
    const rec = { at: iso(), correlation_id, action: a?.id ?? null, binding, principal: actorRef(p), decision: decision?.decision ?? null, reason_code: error ?? decision?.reason_code ?? null, policy_version: policy.policyVersion(), status };
    store.audit.set(`${store.audit.size + 1}`, rec);
    // A signed document (the manifest) is returned byte-for-byte as signed; its correlation id travels only in the header.
    const signedDoc = status < 400 && body && typeof body === "object" && body.signature && !body.idempotent_replay;
    const res = { status, body: signedDoc ? body : { ...body, correlation_id }, headers: { "x-correlation-id": correlation_id, "olip-version": V3 } };
    if (!signedDoc && status < 400 && a && body && typeof body === "object") res.body.action_receipt = { action: a.id, effect: a.id === "olip.call_lifecycle" ? body.effect ?? a.effect : a.effect, decision: decision?.decision ?? "allow", policy_version: policy.policyVersion(), note: TOOL_RESULT_NOTE };
    if (observe) { try { observe({ actionId: a?.id ?? null, status, body: structuredClone(res.body), binding }); } catch { /* observers never change results */ } }
    return res;
  }

  function issueOperatorToken(secret) {
    if (mode !== "mock" || !safeEqual(String(secret || ""), OPERATOR.secret)) return null;
    const t = "v3op_" + randomBytes(24).toString("base64url");
    operatorTokens.set(t, { operator_id: OPERATOR.operator_id, expires_at: nowMs() + OPERATOR_TTL_S * 1000 });
    return t;
  }
  // Mirrors 2.0-draft lifecycle activity into every affected workflow (called after 2.0 writes, so webhooks are timely).
  function syncAll() { if (closed) return; for (const wf of store.workflows.values()) syncLifecycle(wf); }
  async function drain() { while (timers.size) await new Promise((r) => setTimeout(r, 20)); }
  // A closed layer stops retrying webhooks and stops mirroring, so it never writes to a store a restarted layer now owns.
  function close() { closed = true; for (const t of timers) clearTimeout(t); timers.clear(); }

  return { invoke, manifest, jwks, keys, policy, store, checkCapsule, verifyJournal, issueOperatorToken, syncAll, drain, close, mode, hostLabel, get webhookConfig() { return WH; } };
}
