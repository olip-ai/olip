// OLIP 0.1 reference endpoint, with the OLIP 0.2 additions (key bindings, signed status webhooks, intake cards). MOCK MODE ONLY: fictional data, in-memory storage, no real delivery.
// It plays three roles so one process can demonstrate a full handoff: provider discovery, the host that
// keeps CaseBriefs and handoffs, and the recipient firm intake system that signs receipts.
// Run: node reference/server.mjs   (PORT, default 8787)
import { createServer } from "node:http";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { OLIP_VERSION, OLIP_V02, canonicalize, sha256, consentDigest, newKeyPair, signObject, findTransition, isTerminal, wasTransmitted, newId, getPath, STATUS_MACHINE } from "./lib/olip-core.mjs";
import * as FX from "./data/fixtures.mjs";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const SPEC_SHA256 = (() => { try { return sha256(readFileSync(new URL("../spec/OLIP-0.2-DRAFT.md", import.meta.url))); } catch { return null; } })();

const PREVIEW_TTL_S = 30 * 60, AUTH_TTL_S = 30 * 60, TOKEN_TTL_S = 15 * 60, OTP_TTL_S = 10 * 60, MAX_ATTEMPTS = 3;
const NOTICE_VERSION = "olip-mock-notices-2026-11-06";
const NOTICES = [
  { id: "not_relationship", text: "Sending this does not create an attorney-client relationship. The firm decides whether to take the matter." },
  { id: "not_privileged", text: "This message may not be privileged or confidential just because it is sent this way." },
  { id: "deadlines", text: "Sending this does not stop any legal deadline. If you have a court date, contact the court or a lawyer directly as well." },
  { id: "license_record", text: "A license record check is not an endorsement by any court, bar or licensing authority." },
  { id: "only_this_recipient", text: "Only the one recipient named above receives the fields listed above. Nothing else is shared." },
];

export function createOlipServer({ mode = "mock" } = {}) {
  if (mode !== "mock") throw new Error("This reference server runs in mock mode only. It must never hold real client data.");
  const key = newKeyPair();       // the recipient intake system key (signs receipts and recipient events)
  const hostKey = newKeyPair();   // the host key (issues key bindings, signs webhooks and intake cards)
  const ISSUER_ID = "olip-reference-mock-host (fictional)";
  let clockOffsetMs = 0;
  const now = () => new Date(Date.now() + clockOffsetMs);
  const iso = (d = now()) => d.toISOString();
  const plus = (s) => new Date(now().getTime() + s * 1000).toISOString();

  // In-memory stores. reset() clears them.
  let S;
  const reset = () => {
    S = { tokens: new Map(), casebriefs: new Map(), previews: new Map(), approvals: new Map(), authorizations: new Map(), handoffs: new Map(),
      idem: new Map(), inbox: new Map(), deliveries: new Map(), analytics: [], logs: [], rate: new Map(),
      subscriptions: new Map(), webhooks: [], seenWebhookIds: new Set(), revokedBindings: new Map() };
  };
  reset();

  const pub = (p) => { const { _mock, ...rest } = p; return structuredClone(rest); };
  const prof = (id) => FX.PROFESSIONALS.find((p) => p.id === id);
  const err = (status, code, message, extra = {}) => ({ status, body: { olip_version: OLIP_VERSION, error: { code, message, retryable: status === 429 || status >= 500, ...extra } } });
  const ok = (body, status = 200) => ({ status, body: { olip_version: OLIP_VERSION, ...body } });
  const track = (op, outcome, ctx, extra = {}) => {
    // Growth/usage analytics: operation names, outcomes and coarse codes only. Never case text, names or contact details.
    S.analytics.push({ at: iso(), op, outcome, client_id: ctx?.principal?.kind === "client" ? ctx.principal.id : null, jurisdiction: extra.jurisdiction ?? null, matter_code: extra.matter_code ?? null });
  };

  // ---------- auth ----------
  function issueToken(body) {
    const id = body.client_id, secret = body.client_secret;
    const eq = (a, b) => typeof a === "string" && typeof b === "string" && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
    let principal = null;
    if (FX.CLIENTS[id] && eq(secret, FX.CLIENTS[id].secret)) principal = { kind: "client", id };
    else if (FX.RECIPIENT_CREDENTIALS[id] && eq(secret, FX.RECIPIENT_CREDENTIALS[id].secret)) principal = { kind: "recipient", id, professional_ids: FX.RECIPIENT_CREDENTIALS[id].professional_ids };
    if (body.grant_type !== "client_credentials" || !principal) return { status: 401, body: { error: "invalid_client", error_description: "Unknown client or wrong secret." } };
    const token = "olipat_" + randomBytes(24).toString("base64url");
    S.tokens.set(token, { principal, expires_at: now().getTime() + TOKEN_TTL_S * 1000 });
    return { status: 200, body: { access_token: token, token_type: "Bearer", expires_in: TOKEN_TTL_S, scope: principal.kind === "client" ? "olip.read olip.write" : "olip.recipient" } };
  }
  function authenticate(req) {
    const h = req.headers.authorization || "";
    if (!h.startsWith("Bearer ")) return { error: err(401, "OLIP_UNAUTHENTICATED", "A bearer token is required for this operation.") };
    const t = S.tokens.get(h.slice(7));
    if (!t) return { error: err(401, "OLIP_UNAUTHENTICATED", "The token is not valid.") };
    if (t.expires_at <= now().getTime()) return { error: err(401, "OLIP_TOKEN_EXPIRED", "The token has expired. Get a new one.") };
    const r = (S.rate.get(h) || 0) + 1; S.rate.set(h, r);
    if (r > 600) return { error: err(429, "OLIP_RATE_LIMITED", "Too many requests.") };
    return { principal: t.principal };
  }
  const needClient = (ctx) => (ctx.principal?.kind === "client" ? null : err(ctx.principal ? 403 : 401, ctx.principal ? "OLIP_FORBIDDEN" : "OLIP_UNAUTHENTICATED", "This operation needs a calling-agent (client) token."));

  // ---------- discovery, identity, policy (public read profile) ----------
  function interpret(q) {
    const text = ` ${String(q).toLowerCase()} `;
    const candidates = [];
    for (const h of FX.INTERPRETER_HINTS) {
      const hits = h.words.filter((w) => text.includes(w));
      if (!hits.length) continue;
      let client_side = { value: null, status: "unknown" };
      for (const [side, ws] of Object.entries(h.side_words)) {
        const sh = ws.filter((w) => text.includes(w));
        if (sh.length) { client_side = { value: side, status: "inferred", basis: sh }; break; }
      }
      const t = FX.TAXONOMY.find((x) => x.code === h.code);
      candidates.push({ code: h.code, label: t.label, sali: t.sali, confidence: hits.length >= 2 ? "medium" : "low", basis: hits.map((w) => `keyword: ${w.trim()}`), client_side });
    }
    let jurisdiction = { value: null, status: "unknown" };
    for (const [j, ws] of Object.entries(FX.STATE_WORDS)) if (ws.some((w) => text.includes(w))) { jurisdiction = { value: j, status: "inferred" }; break; }
    const unknowns = [];
    if (!jurisdiction.value) unknowns.push({ field: "location.jurisdiction", question: "Which state is the property or matter in?" });
    if (candidates.some((c) => c.code === "housing.landlord_tenant")) {
      if (!/\b(court date|hearing|served|summons|notice)\b/.test(text)) unknowns.push({ field: "key_dates", question: "Have you received any court papers or a notice with a deadline? What date?" });
      else unknowns.push({ field: "key_dates", question: "What is the exact date on the court paper or notice?" });
      unknowns.push({ field: "facts", question: "Has a case already been filed in court?" });
    }
    if (!candidates.length) unknowns.push({ field: "matter.code", question: "What kind of legal problem is this?" });
    if (candidates.some((c) => c.client_side.status === "unknown")) unknowns.push({ field: "client_side", question: "Which side are you on?" });
    return { method: "keyword_hints", matter_candidates: candidates, jurisdiction, unknowns, statement: "This is an automatic reading of the words used. It is not legal advice and may be wrong. Please confirm." };
  }

  function summary(p, matched) {
    const x = pub(p);
    return { id: x.id, type: x.type, display_name: x.display_name, fictional: x.fictional, firm: x.firm,
      licenses: x.licenses.map((l) => ({ jurisdiction: l.jurisdiction, license_id: l.license_id, verification_level: l.verification.level, display_statement: l.display_statement })),
      claim_status: x.claim.status, intake_endpoint_status: x.intake_endpoint.status, matter_types: matched, commercial: x.commercial,
      links: { identity: `/olip/v0.1/professionals/${x.id}`, intake_policy: `/olip/v0.1/professionals/${x.id}/intake-policy` } };
  }

  const ops = {
    discover_providers(ctx, p) {
      const interpretation = p.q ? interpret(p.q) : null;
      const jurisdiction = p.jurisdiction || interpretation?.jurisdiction?.value || null;
      const matter = p.matter || (interpretation?.matter_candidates?.length === 1 ? interpretation.matter_candidates[0].code : null);
      const language = p.language || null;
      if (jurisdiction && !/^US-[A-Z]{2}$/.test(jurisdiction)) return err(400, "OLIP_INVALID_REQUEST", "jurisdiction must look like US-CA.");
      const results = FX.PROFESSIONALS.filter((x) => {
        const pol = FX.POLICIES[x.id];
        if (jurisdiction && !x.licenses.some((l) => l.jurisdiction === jurisdiction)) return false;
        if (matter && !pol.matter_types.some((m) => m.code === matter)) return false;
        if (language && !pol.languages.includes(language)) return false;
        return true;
      }).sort((a, b) => a.family_name.localeCompare(b.family_name)) // stated order; payment never used
        .slice(0, Math.min(Number(p.limit) || 25, 50))
        .map((x) => summary(x, FX.POLICIES[x.id].matter_types.filter((m) => !matter || m.code === matter)));
      const legal_aid_options = FX.LEGAL_AID.filter((o) => (o.jurisdictions.includes("*") || !jurisdiction || o.jurisdictions.includes(jurisdiction)) && (o.matter_codes.includes("*") || !matter || o.matter_codes.includes(matter)));
      track("discover_providers", results.length ? "results" : "no_match", ctx, { jurisdiction, matter_code: matter });
      return ok({
        interpretation, query: { jurisdiction, matter, language },
        ordering: { method: "family_name_alphabetical", paid_influence: false, disclosure: "Listed in alphabetical order by family name. Payment, subscriptions and advertising never change who is listed or the order." },
        results,
        no_match: results.length ? null : { reason: jurisdiction && matter ? "no_listed_professional_for_matter_and_jurisdiction" : "not_enough_information", message: "No listed professional fits these filters. Free legal help options are listed below." },
        legal_aid_options,
        notices: [NOTICES[3]],
      });
    },
    get_professional_identity(ctx, p) {
      const x = prof(p.professional_id);
      if (!x) return err(404, "OLIP_NOT_FOUND", "No professional with that id.");
      track("get_professional_identity", "ok", ctx);
      return ok({ professional: pub(x), notices: [NOTICES[3]] });
    },
    get_intake_policy(ctx, p) {
      const pol = FX.POLICIES[p.professional_id];
      if (!pol) return err(404, "OLIP_NOT_FOUND", "No professional with that id.");
      track("get_intake_policy", "ok", ctx);
      return ok({ intake_policy: structuredClone(pol) });
    },

    // ---------- CaseBrief (write profile) ----------
    validate_casebrief(ctx, p) {
      const e = needClient(ctx); if (e) return e;
      const cb = p.casebrief;
      if (!cb || typeof cb !== "object") return err(400, "OLIP_INVALID_REQUEST", "casebrief is required.");
      const pol = p.recipient_id ? FX.POLICIES[p.recipient_id] : null;
      if (p.recipient_id && !pol) return err(404, "OLIP_NOT_FOUND", "No professional with that id.");
      const required = pol ? pol.required_fields : ["summary", "client.name", "client.email", "location.jurisdiction", "matter.code"];
      const missing_required = required.filter((f) => { const v = getPath(cb, f); return v == null || v === "" || (Array.isArray(v) && !v.length); });
      const warnings = sensitiveScan(cb);
      track("validate_casebrief", missing_required.length ? "incomplete" : "complete", ctx);
      return ok({ valid: missing_required.length === 0 && shapeProblems(cb).length === 0, transmitted: false, missing_required, shape_problems: shapeProblems(cb), warnings,
        open_questions: missing_required.map((f) => ({ field: f, question: QUESTIONS[f] || `Please add ${f}.` })),
        statement: "Nothing was sent. Validation only checks this draft." });
    },
    create_casebrief(ctx, p) {
      const e = needClient(ctx); if (e) return e;
      const problems = shapeProblems(p.casebrief);
      if (problems.length) return err(400, "OLIP_INVALID_REQUEST", "The CaseBrief has problems.", { details: problems });
      const id = newId("cbr");
      const cb = { ...structuredClone(p.casebrief), olip_version: OLIP_VERSION, id, revision: 1, created_at: iso(), updated_at: iso(), content_trust: "untrusted_user_supplied" };
      S.casebriefs.set(id, { owner: ctx.principal.id, cb });
      track("create_casebrief", "ok", ctx, { jurisdiction: cb.location?.jurisdiction, matter_code: cb.matter?.code });
      return ok({ casebrief: cb, transmitted: false }, 201);
    },
    get_casebrief(ctx, p) {
      const e = needClient(ctx); if (e) return e;
      const r = S.casebriefs.get(p.casebrief_id);
      if (!r || r.owner !== ctx.principal.id) return err(404, "OLIP_NOT_FOUND", "No CaseBrief with that id."); // same answer for other tenants
      return ok({ casebrief: r.cb });
    },
    update_casebrief(ctx, p) {
      const e = needClient(ctx); if (e) return e;
      const r = S.casebriefs.get(p.casebrief_id);
      if (!r || r.owner !== ctx.principal.id) return err(404, "OLIP_NOT_FOUND", "No CaseBrief with that id.");
      if (p.if_revision != null && Number(p.if_revision) !== r.cb.revision) return err(409, "OLIP_REVISION_CONFLICT", `The CaseBrief is at revision ${r.cb.revision}.`);
      const problems = shapeProblems(p.casebrief);
      if (problems.length) return err(400, "OLIP_INVALID_REQUEST", "The CaseBrief has problems.", { details: problems });
      const { id, revision, created_at, olip_version, content_trust, ...rest } = p.casebrief;
      r.cb = { ...structuredClone(rest), olip_version: OLIP_VERSION, id: r.cb.id, revision: r.cb.revision + 1, created_at: r.cb.created_at, updated_at: iso(), content_trust: "untrusted_user_supplied" };
      track("update_casebrief", "ok", ctx);
      return ok({ casebrief: r.cb, transmitted: false, statement: "Saved as a new revision. Any earlier approval no longer matches and cannot be used." });
    },
    delete_casebrief(ctx, p) {
      const e = needClient(ctx); if (e) return e;
      const r = S.casebriefs.get(p.casebrief_id);
      if (!r || r.owner !== ctx.principal.id) return err(404, "OLIP_NOT_FOUND", "No CaseBrief with that id.");
      S.casebriefs.delete(p.casebrief_id);
      const sentTo = [...S.handoffs.values()].filter((h) => h.casebrief_id === p.casebrief_id && (wasTransmitted(h.state) || h.cancellation?.effect === "withdrawal_notice_sent_recipient_may_retain_copy")).map((h) => ({ handoff_id: h.handoff_id, recipient_id: h.recipient_id, state: h.state }));
      for (const pv of S.previews.values()) if (pv.casebrief_id === p.casebrief_id && pv.state === "draft") pv.state = "cancelled";
      track("delete_casebrief", "ok", ctx);
      return ok({ deleted: true, limits: sentTo.length ? ["Your draft was deleted here. Recipients who already received a copy keep it under their own retention policy. Ask them directly to delete it."] : [], already_transmitted: sentTo });
    },
    export_casebrief(ctx, p) {
      const e = needClient(ctx); if (e) return e;
      const r = S.casebriefs.get(p.casebrief_id);
      if (!r || r.owner !== ctx.principal.id) return err(404, "OLIP_NOT_FOUND", "No CaseBrief with that id.");
      const handoffs = [...S.handoffs.values()].filter((h) => h.casebrief_id === p.casebrief_id).map((h) => ({ handoff_id: h.handoff_id, recipient_id: h.recipient_id, state: h.state }));
      return ok({ format: "olip-casebrief-export-0.1", casebrief: r.cb, handoffs });
    },

    // ---------- preview + approval ----------
    preview_handoff(ctx, p) {
      const e = needClient(ctx); if (e) return e;
      const r = S.casebriefs.get(p.casebrief_id);
      if (!r || r.owner !== ctx.principal.id) return err(404, "OLIP_NOT_FOUND", "No CaseBrief with that id.");
      if (!Array.isArray(p.recipient_ids) && typeof p.recipient_id !== "string") return err(400, "OLIP_INVALID_REQUEST", "recipient_id is required.");
      if (Array.isArray(p.recipient_ids) && p.recipient_ids.length !== 1) return err(400, "OLIP_ONE_RECIPIENT_ONLY", "A preview names exactly one recipient. Bulk handoffs are not allowed.");
      const recipient_id = p.recipient_id ?? p.recipient_ids[0];
      const x = prof(recipient_id); const pol = FX.POLICIES[recipient_id];
      if (!x) return err(404, "OLIP_NOT_FOUND", "No professional with that id.");
      const mode = p.mode || "consumer_selected_listing";
      const purpose = p.purpose || "request_initial_contact";
      if (!["request_initial_contact", "request_consultation"].includes(purpose)) return err(400, "OLIP_INVALID_REQUEST", "purpose must be request_initial_contact or request_consultation.");
      const fields = Array.isArray(p.fields) ? [...new Set(p.fields)] : null;
      if (!fields || !fields.length) return err(400, "OLIP_INVALID_REQUEST", "fields must list the CaseBrief fields to share.");
      const gate = policyGate({ cb: r.cb, x, pol, mode, selection: p.selection });
      if (gate.result !== "allowed") { track("preview_handoff", "policy_blocked", ctx, { jurisdiction: r.cb.location?.jurisdiction }); return err(422, "OLIP_POLICY_BLOCKED", gate.message, { policy_gate: gate, allowed_alternatives: gate.allowed_alternatives }); }
      const accepted = new Set([...pol.required_fields, ...pol.optional_fields]);
      const notAccepted = fields.filter((f) => !accepted.has(f));
      if (notAccepted.length) return err(422, "OLIP_FIELD_NOT_ACCEPTED", "The recipient does not accept some of these fields.", { details: notAccepted });
      const missing = pol.required_fields.filter((f) => !fields.includes(f) || getPath(r.cb, f) == null || getPath(r.cb, f) === "");
      if (missing.length) return err(422, "OLIP_REQUIRED_FIELD_MISSING", "The recipient needs these fields.", { details: missing });
      const shared_fields = fields.map((f) => ({ path: f, label: LABELS[f] || f, value: structuredClone(getPath(r.cb, f)) })).filter((f) => f.value !== undefined);
      const withheld_fields = ALL_PATHS.filter((f) => !fields.includes(f) && getPath(r.cb, f) != null);
      const preview_id = newId("prv"), k = randomBytes(18).toString("base64url");
      const recipient = { professional_id: x.id, display_name: x.display_name, firm_name: x.firm.name, license_statements: x.licenses.map((l) => l.display_statement), intake_endpoint_status: x.intake_endpoint.status, delivery_topology: pol.delivery.topology };
      const digest = consentDigest({ recipient_id, casebrief_id: r.cb.id, casebrief_revision: r.cb.revision, purpose, mode, shared_fields, notice_version: NOTICE_VERSION });
      const pv = { olip_version: OLIP_VERSION, preview_id, state: "draft", owner: ctx.principal.id, casebrief_id: r.cb.id, casebrief_revision: r.cb.revision, recipient, mode, purpose, shared_fields, withheld_fields,
        notices: NOTICES, notice_version: NOTICE_VERSION, policy_gate: gate, consent_digest: digest, created_at: iso(), expires_at: plus(PREVIEW_TTL_S),
        approval: { method: "hosted_otp", url: `/olip/v0.1/approvals/${preview_id}?k=${k}`, instructions: "Show this link to the user. Only the user can approve, with a code sent to their own email. The agent must not approve." }, authorization_id: null, _k: k };
      S.previews.set(preview_id, pv);
      track("preview_handoff", "ok", ctx, { jurisdiction: r.cb.location?.jurisdiction, matter_code: r.cb.matter?.code });
      return ok({ preview: viewPreview(pv), transmitted: false }, 201);
    },
    get_handoff_preview(ctx, p) {
      const e = needClient(ctx); if (e) return e;
      const pv = S.previews.get(p.preview_id);
      if (!pv || pv.owner !== ctx.principal.id) return err(404, "OLIP_NOT_FOUND", "No preview with that id.");
      expireIfDue(pv);
      return ok({ preview: viewPreview(pv) });
    },
    revoke_handoff_preview(ctx, p) {
      const e = needClient(ctx); if (e) return e;
      const pv = S.previews.get(p.preview_id);
      if (!pv || pv.owner !== ctx.principal.id) return err(404, "OLIP_NOT_FOUND", "No preview with that id.");
      if (!["draft", "approved"].includes(pv.state)) return err(409, "OLIP_INVALID_TRANSITION", `The preview is ${pv.state}.`);
      pv.state = "cancelled";
      if (pv.authorization_id) S.authorizations.get(pv.authorization_id).revoked_at = iso();
      return ok({ preview: viewPreview(pv), statement: "Approval withdrawn. Nothing was sent." });
    },

    // ---------- submit + status ----------
    submit_approved_handoff(ctx, p, meta) {
      const e = needClient(ctx); if (e) return e;
      const ikey = meta?.idempotency_key;
      if (!ikey || ikey.length < 8 || ikey.length > 200) return err(428, "OLIP_IDEMPOTENCY_KEY_REQUIRED", "Send an Idempotency-Key of 8 to 200 characters.");
      const bodyHash = sha256(canonicalize({ authorization_id: p.authorization_id ?? null, consent_digest: p.consent_digest ?? null, recipient_id: p.recipient_id ?? null }));
      const ik = `${ctx.principal.id}:${ikey}`;
      const prior = S.idem.get(ik);
      if (prior) {
        if (prior.bodyHash !== bodyHash) return err(422, "OLIP_IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used with a different request.");
        const h = S.handoffs.get(prior.handoff_id);
        return ok({ handoff: viewHandoff(h, ctx), idempotent_replay: true }, 200);
      }
      const a = S.authorizations.get(p.authorization_id);
      if (!a || a.owner !== ctx.principal.id) return err(403, "OLIP_AUTHORIZATION_INVALID", "No user approval with that id exists for this caller.");
      const pv = S.previews.get(a.preview_id);
      if (a.revoked_at) return err(409, "OLIP_AUTHORIZATION_REVOKED", "The user withdrew this approval.");
      if (a.used_at) return err(409, "OLIP_AUTHORIZATION_USED", "This approval was already used. Each approval sends once.");
      if (new Date(a.expires_at) <= now()) { pv.state = "expired"; return err(410, "OLIP_AUTHORIZATION_EXPIRED", "The approval expired. Ask the user to review and approve again."); }
      if (p.consent_digest !== a.consent_digest) return err(409, "OLIP_CONSENT_MISMATCH", "consent_digest does not match what the user approved.");
      if (p.recipient_id != null && p.recipient_id !== pv.recipient.professional_id) return err(409, "OLIP_CONSENT_MISMATCH", "The user approved a different recipient.");
      // Recompute from the CaseBrief as it is now. Any edit since approval changes the digest.
      const r = S.casebriefs.get(pv.casebrief_id);
      const current = r ? consentDigest({ recipient_id: pv.recipient.professional_id, casebrief_id: pv.casebrief_id, casebrief_revision: r.cb.revision, purpose: pv.purpose, mode: pv.mode,
        shared_fields: pv.shared_fields.map((f) => ({ path: f.path, value: getPath(r.cb, f.path) })), notice_version: NOTICE_VERSION }) : null;
      if (current !== a.consent_digest) { pv.state = "cancelled"; a.revoked_at = iso(); return err(409, "OLIP_AUTHORIZATION_STALE", "The CaseBrief changed after the user approved it. Create a new preview and ask the user to approve again."); }
      const x = prof(pv.recipient.professional_id); const pol = FX.POLICIES[x.id];
      const gate = policyGate({ cb: r.cb, x, pol, mode: pv.mode, selection: { by: "user" } });
      if (gate.result !== "allowed") return err(422, "OLIP_POLICY_BLOCKED", gate.message, { policy_gate: gate, allowed_alternatives: gate.allowed_alternatives });

      a.used_at = iso();
      const handoff_id = newId("hnd");
      const payload = Object.fromEntries(pv.shared_fields.map((f) => [f.path, f.value]));
      const h = { olip_version: OLIP_VERSION, handoff_id, owner: ctx.principal.id, state: "approved", recipient_id: x.id, mode: pv.mode, purpose: pv.purpose, casebrief_id: pv.casebrief_id,
        casebrief_revision: pv.casebrief_revision, consent_digest: a.consent_digest, authorization_id: a.authorization_id, preview_id: pv.preview_id, created_at: iso(), updated_at: iso(),
        events: [], payload, payload_sha256: sha256(canonicalize(payload)), receipt: null, delivery: { topology: pol.delivery.topology, attempts: [], max_attempts: MAX_ATTEMPTS }, cancellation: null };
      h.events.push(mkEvent(h, "draft", "approved", "user", { type: "user_approval", ref: a.authorization_id }, a.approved_at));
      pv.state = "submitted";
      S.handoffs.set(handoff_id, h);
      deliver(h, x);
      S.idem.set(ik, { bodyHash, handoff_id });
      track("submit_approved_handoff", h.state, ctx, { jurisdiction: r.cb.location?.jurisdiction, matter_code: r.cb.matter?.code });
      return ok({ handoff: viewHandoff(h, ctx), idempotent_replay: false }, 201);
    },
    get_handoff_status(ctx, p) {
      const h = S.handoffs.get(p.handoff_id);
      if (!h || !canSee(ctx, h)) return err(404, "OLIP_NOT_FOUND", "No handoff with that id.");
      return ok({ handoff: viewHandoff(h, ctx) });
    },
    cancel_handoff(ctx, p) {
      const e = needClient(ctx); if (e) return e;
      const h = S.handoffs.get(p.handoff_id);
      if (!h || h.owner !== ctx.principal.id) return err(404, "OLIP_NOT_FOUND", "No handoff with that id.");
      const t = findTransition(h.state, "cancelled", "client");
      if (!t.ok) return err(409, t.code, isTerminal(h.state) ? `The handoff is already ${h.state} and cannot be cancelled.` : t.message);
      const transmitted = wasTransmitted(h.state);
      const from = h.state;
      h.events.push(mkEvent(h, from, "cancelled", "client", { type: "cancel_request", ref: newId("cxl") }));
      h.state = "cancelled"; h.updated_at = iso();
      h.cancellation = { requested_at: iso(), effect: transmitted ? "withdrawal_notice_sent_recipient_may_retain_copy" : "not_transmitted",
        limits: transmitted ? ["The recipient already received this. They were told you withdrew it, but they may keep a copy under their own retention policy and professional rules."] : [] };
      track("cancel_handoff", h.cancellation.effect, ctx);
      return ok({ handoff: viewHandoff(h, ctx) });
    },
    subscribe_status_webhook(ctx, p) { return subscribe(ctx, p); },
    record_recipient_event(ctx, p) {
      if (!ctx.principal) return err(401, "OLIP_UNAUTHENTICATED", "A recipient token is required.");
      const h = S.handoffs.get(p.handoff_id);
      if (!h || !canSee(ctx, h)) return err(404, "OLIP_NOT_FOUND", "No handoff with that id.");
      if (ctx.principal.kind !== "recipient") return err(403, "OLIP_EVENT_SOURCE_FORBIDDEN", "Only the recipient's own system can record recipient events. A calling agent cannot.");
      const type = p.type;
      if (!STATUS_MACHINE.recipient_event_types.includes(type)) return err(403, "OLIP_EVENT_SOURCE_FORBIDDEN", `A recipient cannot record "${type}".`);
      if (!p.evidence || p.evidence.type !== "recipient_attestation" || !p.evidence.ref) return err(400, "OLIP_EVIDENCE_REQUIRED", "evidence {type: recipient_attestation, ref} is required.");
      const actorKind = p.actor?.kind === "human" ? "human" : "automated";
      const source = actorKind === "human" ? "recipient_human" : "recipient_system";
      const t = findTransition(h.state, type, source);
      if (!t.ok) return err(t.code === "OLIP_INVALID_TRANSITION" ? 409 : 403, t.code, t.message);
      const from = h.state;
      h.events.push(mkEvent(h, from, type, source, { type: "recipient_attestation", ref: String(p.evidence.ref).slice(0, 200) }, null, { kind: actorKind, role: p.actor?.role || null }, p.time_zone));
      h.state = type; h.updated_at = iso();
      track("record_recipient_event", type, ctx);
      return ok({ handoff: viewHandoff(h, ctx) });
    },
  };

  // ---------- helpers ----------
  const QUESTIONS = { summary: "In a few sentences, what happened?", "client.name": "What name should the lawyer use for you?", "client.email": "What email should the lawyer reply to?",
    "location.jurisdiction": "Which state is this in?", "matter.code": "What kind of legal problem is this?" };
  const LABELS = { summary: "Summary", "client.name": "Your name", "client.email": "Your email", "client.phone": "Your phone", "client.preferred_language": "Preferred language",
    "location.jurisdiction": "State", "location.county": "County", "location.city": "City", "matter.code": "Type of problem", facts: "Facts you reported", objectives: "What you want",
    key_dates: "Key dates", parties: "Other people or companies involved", open_questions: "Open questions" };
  const ALL_PATHS = Object.keys(LABELS).concat(["documents"]);

  function shapeProblems(cb) {
    const out = [];
    if (!cb || typeof cb !== "object" || Array.isArray(cb)) return ["casebrief must be an object"];
    if (cb.summary != null && (typeof cb.summary !== "string" || cb.summary.length > 4000)) out.push("summary must be text up to 4000 characters");
    if (cb.client != null && typeof cb.client !== "object") out.push("client must be an object");
    if (cb.client?.email != null && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cb.client.email)) out.push("client.email is not an email address");
    if (cb.location?.jurisdiction != null && !/^US-[A-Z]{2}$/.test(cb.location.jurisdiction)) out.push("location.jurisdiction must look like US-CA");
    for (const k of ["facts", "objectives", "key_dates", "parties", "open_questions", "documents"]) if (cb[k] != null && !Array.isArray(cb[k])) out.push(`${k} must be a list`);
    if (Array.isArray(cb.documents) && cb.documents.some((d) => d && d.content)) out.push("documents may hold references only, never file content");
    return out;
  }
  function sensitiveScan(cb) {
    const text = JSON.stringify(cb);
    const w = [];
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(text)) w.push({ code: "possible_ssn", message: "This looks like a Social Security number. Remove it; a lawyer does not need it to reply." });
    if (/\b(?:\d[ -]?){13,19}\b/.test(text)) w.push({ code: "possible_card_or_account_number", message: "This looks like a card or account number. Remove it." });
    if (/\b(diagnos|hiv|medical record|immigration status)/i.test(text)) w.push({ code: "special_category_data", message: "This includes sensitive personal details. Share only what is needed for a first contact." });
    return w;
  }
  function policyGate({ cb, x, pol, mode, selection }) {
    const j = cb.location?.jurisdiction || null;
    const checks = [];
    const alt = [
      { kind: "contact_directly", description: `Call or visit the firm's own website: ${x.firm.phone || "phone not listed"}, ${x.firm.website || "website not listed"}.` },
      { kind: "legal_aid", description: "See free legal help options for your state." },
    ];
    const block = (code, message, extraAlt = []) => ({ result: "blocked", code, message, checks, rules_review_status: FX.JURISDICTION_RULES[j]?.review_status || "no_rules", allowed_alternatives: [...extraAlt, ...alt] });
    if (!j) return block("jurisdiction_unknown", "The state is not known yet, so no handoff can be prepared. Ask the user which state this is in.");
    const rules = FX.JURISDICTION_RULES[j];
    if (!rules) return block("jurisdiction_not_supported", `This endpoint has no reviewed rules for ${j}. No handoff is allowed there.`);
    const m = rules.modes[mode];
    if (!m) return block("mode_unknown", `Unknown mode ${mode}.`);
    checks.push({ check: "mode_allowed_in_jurisdiction", jurisdiction: j, mode, passed: m.allowed });
    if (!m.allowed) return block("mode_not_allowed", m.reason, mode !== "consumer_selected_listing" ? [{ kind: "use_mode", mode: "consumer_selected_listing", description: "The user picks a named lawyer from the list and approves sending to that one lawyer." }] : []);
    const licensed = x.licenses.some((l) => l.jurisdiction === j);
    checks.push({ check: "recipient_licensed_in_jurisdiction", passed: licensed, evidence_level: x.licenses.find((l) => l.jurisdiction === j)?.verification.level || null });
    if (!licensed) return block("recipient_not_licensed_here", `${x.display_name} has no license record for ${j}.`);
    const active = x.intake_endpoint.status === "active" || x.intake_endpoint.status === "unhealthy";
    checks.push({ check: "recipient_has_intake_endpoint", passed: active });
    if (!active) return block("recipient_has_no_intake_endpoint", `${x.display_name} has not set up online intake. Contact the firm directly instead.`);
    checks.push({ check: "recipient_accepts_mode", passed: pol.regulatory.modes_allowed.includes(mode) });
    if (!pol.regulatory.modes_allowed.includes(mode)) return block("recipient_does_not_accept_mode", `${x.display_name} does not accept requests in mode ${mode}.`);
    if (m.conditions?.includes("recipient_listing_agreement_accepted")) {
      checks.push({ check: "recipient_listing_agreement_accepted", passed: pol.regulatory.listing_agreement_accepted });
      if (!pol.regulatory.listing_agreement_accepted) return block("recipient_listing_agreement_missing", `${x.display_name} has not accepted the listing terms needed for messages in ${j}. Contact the firm directly instead.`);
    }
    if (m.conditions?.includes("user_selected_recipient")) {
      const bySelf = selection?.by === "user";
      checks.push({ check: "user_selected_recipient", passed: bySelf });
      if (!bySelf) return block("recipient_not_selected_by_user", "The user must pick this lawyer themself. Send selection {by: \"user\"} only when they did.");
    }
    const matterOk = pol.matter_types.some((t) => t.code === cb.matter?.code);
    checks.push({ check: "recipient_lists_matter_type", passed: matterOk, note: "Practice fit is the recipient's own statement, not a legal conclusion or endorsement." });
    if (!matterOk) return block("recipient_does_not_list_matter", `${x.display_name} does not list this type of matter.`);
    return { result: "allowed", code: "allowed", message: "Allowed by this endpoint's illustrative rules (pending legal review).", checks, rules_review_status: rules.review_status, allowed_alternatives: [] };
  }
  function viewPreview(pv) {
    const { owner, _k, ...rest } = pv;
    return structuredClone(rest);
  }
  function expireIfDue(pv) {
    if (pv.state === "draft" && new Date(pv.expires_at) <= now()) pv.state = "expired";
    if (pv.state === "approved" && pv.authorization_id && new Date(S.authorizations.get(pv.authorization_id).expires_at) <= now()) pv.state = "expired";
  }
  function canSee(ctx, h) {
    if (!ctx.principal) return false;
    if (ctx.principal.kind === "client") return h.owner === ctx.principal.id;
    if (ctx.principal.kind === "recipient") return ctx.principal.professional_ids.includes(h.recipient_id) && wasTransmitted(h.state) || (ctx.principal.professional_ids.includes(h.recipient_id) && h.state === "cancelled" && h.cancellation?.effect !== "not_transmitted");
    return false;
  }
  function mkEvent(h, from, to, source, evidence, occurred_at = null, actor = null, time_zone = null) {
    const ev = { event_id: newId("evt"), handoff_id: h.handoff_id, from_state: from, to_state: to, occurred_at: occurred_at || iso(), recorded_at: iso(), source, actor, evidence, time_zone: time_zone || "UTC" };
    const t = findTransition(from, to, source);
    if (!t.ok) throw new Error(`internal: illegal transition ${from}->${to} by ${source}`);
    const final = source.startsWith("recipient") ? signObject(ev, key) : ev;
    queueMicrotask(() => dispatchWebhooks(h.handoff_id, final));
    return final;
  }
  function deliver(h, x) {
    const behavior = x._mock.behavior;
    if (h.delivery.topology === "direct") {
      // This server is also the recipient's intake system: store and sign a receipt.
      const pol = FX.POLICIES[x.id];
      h.receipt = signObject({ receipt_id: newId("rcp"), handoff_id: h.handoff_id, recipient_id: x.id, received_at: iso(), payload_sha256: h.payload_sha256, consent_digest: h.consent_digest,
        retention_days: pol.retention_days, statement: "Stored by the recipient's intake system. This is not proof that a person has read it, and not acceptance of the matter." }, key);
      h.events.push(mkEvent(h, "approved", "delivered", "recipient_system", { type: "recipient_receipt", ref: h.receipt.receipt_id, sha256: sha256(canonicalize(h.receipt)) }));
      h.state = "delivered";
      S.deliveries.set(x.id, (S.deliveries.get(x.id) || 0) + 1);
    } else if (behavior === "relay_email") {
      h.events.push(mkEvent(h, "approved", "queued", "host", { type: "host_storage", ref: h.handoff_id }));
      h.delivery.attempts.push({ at: iso(), outcome: "accepted_by_transport", channel: "email", transport_ref: `mock-smtp-250-${newId("msg")}` });
      h.events.push(mkEvent(h, "queued", "sent", "transport", { type: "transport_acceptance", ref: h.delivery.attempts[0].transport_ref }));
      h.state = "sent";
      S.deliveries.set(x.id, (S.deliveries.get(x.id) || 0) + 1);
    } else {
      h.events.push(mkEvent(h, "approved", "queued", "host", { type: "host_storage", ref: h.handoff_id }));
      h.state = "queued";
      for (let i = 0; i < MAX_ATTEMPTS; i++) h.delivery.attempts.push({ at: iso(), outcome: "failed", channel: "webhook", error_code: "OLIP_RECIPIENT_UNREACHABLE" });
      h.events.push(mkEvent(h, "queued", "failed", "host", { type: "delivery_attempts_exhausted", ref: `${MAX_ATTEMPTS}_attempts` }));
      h.state = "failed";
    }
    h.updated_at = iso();
  }
  function viewHandoff(h, ctx) {
    const { owner, ...rest } = structuredClone(h);
    const meaning = STATUS_MACHINE.states[h.state].meaning;
    return { ...rest, state_meaning: meaning, engagement: { status: "unknown", statement: "Delivery, acknowledgment or a reply is not acceptance of the matter and does not create an attorney-client relationship." } };
  }

  // ---------- approvals (the user's own page; not an agent operation) ----------
  function approvalPage(pv, k) {
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const rows = pv.shared_fields.map((f) => `<tr><th>${esc(f.label)}</th><td>${esc(typeof f.value === "string" ? f.value : JSON.stringify(f.value))}</td></tr>`).join("");
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Approve sending (test)</title>
<style>:root{--ink:#1d2024;--bg:#fff;--rule:#d6d9dc}@media (prefers-color-scheme:dark){:root{--ink:#eceeea;--bg:#121418;--rule:#3a4049}}body{font:16px/1.5 system-ui,sans-serif;color:var(--ink);background:var(--bg);margin:0 auto;max-width:720px;padding:16px}table{border-collapse:collapse;width:100%}th,td{border-top:1px solid var(--rule);padding:8px;text-align:left;vertical-align:top}</style></head>
<body><p><strong>TEST MODE. Fictional data only.</strong></p><h1>Send this to one lawyer?</h1>
<p>Recipient: <strong data-olip="recipient">${esc(pv.recipient.display_name)}</strong>, ${esc(pv.recipient.firm_name)}</p>
<p>${pv.recipient.license_statements.map(esc).join("<br>")}</p><h2>Exactly what will be shared</h2><table>${rows}</table>
<p>Not shared: ${esc(pv.withheld_fields.join(", ") || "nothing else")}</p><h2>Please read</h2><ul>${pv.notices.map((n) => `<li>${esc(n.text)}</li>`).join("")}</ul>
<p>Approval code: <code data-olip="consent_digest">${esc(pv.consent_digest)}</code></p>
<form method="post" action="/olip/v0.1/approvals/${esc(pv.preview_id)}/send-code"><input type="hidden" name="k" value="${esc(k)}"><button>Email me a code to approve</button></form></body></html>`;
  }
  function approvalSendCode(pv, k) {
    if (!k || k !== pv._k) return err(404, "OLIP_NOT_FOUND", "Unknown approval link.");
    expireIfDue(pv);
    if (pv.state !== "draft") return err(409, "OLIP_INVALID_TRANSITION", `This preview is ${pv.state}.`);
    const r = S.casebriefs.get(pv.casebrief_id);
    const email = r?.cb.client?.email;
    if (!email) return err(422, "OLIP_REQUIRED_FIELD_MISSING", "The CaseBrief has no client email to send a code to.");
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    S.approvals.set(pv.preview_id, { code, expires_at: now().getTime() + OTP_TTL_S * 1000, tries: 0 });
    const box = S.inbox.get(email.toLowerCase()) || []; box.push({ at: iso(), subject: "Your approval code", code, preview_id: pv.preview_id }); S.inbox.set(email.toLowerCase(), box);
    return ok({ code_sent: true, to: email.replace(/^(.).*@/, "$1***@") });
  }
  function approvalConfirm(pv, b) {
    if (!b.k || b.k !== pv._k) return err(404, "OLIP_NOT_FOUND", "Unknown approval link.");
    expireIfDue(pv);
    if (pv.state !== "draft") return err(409, "OLIP_INVALID_TRANSITION", `This preview is ${pv.state}.`);
    const ap = S.approvals.get(pv.preview_id);
    if (!ap || ap.expires_at <= now().getTime()) return err(410, "OLIP_APPROVAL_CODE_EXPIRED", "Ask for a new code.");
    if (++ap.tries > 5) { S.approvals.delete(pv.preview_id); return err(429, "OLIP_RATE_LIMITED", "Too many wrong codes. Ask for a new code."); }
    if (String(b.code) !== ap.code) return err(403, "OLIP_APPROVAL_CODE_WRONG", "That code is not right.");
    if (b.consent_digest !== pv.consent_digest) return err(409, "OLIP_CONSENT_MISMATCH", "The approval page you saw is out of date.");
    S.approvals.delete(pv.preview_id);
    const a = { authorization_id: newId("auz"), preview_id: pv.preview_id, owner: pv.owner, consent_digest: pv.consent_digest, method: "hosted_otp", approved_at: iso(), expires_at: plus(AUTH_TTL_S), single_use: true, used_at: null, revoked_at: null };
    S.authorizations.set(a.authorization_id, a);
    pv.state = "approved"; pv.authorization_id = a.authorization_id;
    return ok({ authorization: { olip_version: OLIP_VERSION, authorization_id: a.authorization_id, preview_id: a.preview_id, consent_digest: a.consent_digest, method: a.method, approved_at: a.approved_at, expires_at: a.expires_at, single_use: true } }, 201);
  }

  // ---------- HTTP ----------
  const routes = [
    ["GET", /^\/olip\/v0\.1\/providers$/, (q) => ["discover_providers", q]],
    ["GET", /^\/olip\/v0\.1\/professionals\/([\w-]+)$/, (q, m) => ["get_professional_identity", { professional_id: m[1] }]],
    ["GET", /^\/olip\/v0\.1\/professionals\/([\w-]+)\/intake-policy$/, (q, m) => ["get_intake_policy", { professional_id: m[1] }]],
    ["POST", /^\/olip\/v0\.1\/casebriefs\/validate$/, (q, m, b) => ["validate_casebrief", b]],
    ["POST", /^\/olip\/v0\.1\/casebriefs$/, (q, m, b) => ["create_casebrief", { casebrief: b.casebrief ?? b }]],
    ["GET", /^\/olip\/v0\.1\/casebriefs\/([\w-]+)$/, (q, m) => ["get_casebrief", { casebrief_id: m[1] }]],
    ["PUT", /^\/olip\/v0\.1\/casebriefs\/([\w-]+)$/, (q, m, b, req) => ["update_casebrief", { casebrief_id: m[1], casebrief: b.casebrief ?? b, if_revision: req.headers["if-match"]?.replace(/"/g, "") ?? null }]],
    ["DELETE", /^\/olip\/v0\.1\/casebriefs\/([\w-]+)$/, (q, m) => ["delete_casebrief", { casebrief_id: m[1] }]],
    ["GET", /^\/olip\/v0\.1\/casebriefs\/([\w-]+)\/export$/, (q, m) => ["export_casebrief", { casebrief_id: m[1] }]],
    ["POST", /^\/olip\/v0\.1\/handoff-previews$/, (q, m, b) => ["preview_handoff", b]],
    ["GET", /^\/olip\/v0\.1\/handoff-previews\/([\w-]+)$/, (q, m) => ["get_handoff_preview", { preview_id: m[1] }]],
    ["POST", /^\/olip\/v0\.1\/handoff-previews\/([\w-]+)\/revoke$/, (q, m) => ["revoke_handoff_preview", { preview_id: m[1] }]],
    ["POST", /^\/olip\/v0\.1\/handoffs$/, (q, m, b) => ["submit_approved_handoff", b]],
    ["GET", /^\/olip\/v0\.1\/handoffs\/([\w-]+)$/, (q, m) => ["get_handoff_status", { handoff_id: m[1] }]],
    ["POST", /^\/olip\/v0\.1\/handoffs\/([\w-]+)\/cancel$/, (q, m) => ["cancel_handoff", { handoff_id: m[1] }]],
    ["POST", /^\/olip\/v0\.1\/handoffs\/([\w-]+)\/events$/, (q, m, b) => ["record_recipient_event", { ...b, handoff_id: m[1] }]],
    ["POST", /^\/olip\/v0\.2\/handoffs\/([\w-]+)\/subscriptions$/, (q, m, b) => ["subscribe_status_webhook", { ...b, handoff_id: m[1] }]],
  ];
  const PUBLIC_OPS = new Set(["discover_providers", "get_professional_identity", "get_intake_policy"]);


  // ---------- OLIP 0.2 additions ----------
  const jwks = () => ({ keys: [{ ...key.publicJwk, olip_key_role: "recipient_intake" }, { ...hostKey.publicJwk, olip_key_role: "host" }] });
  const issuer = () => ({ id: ISSUER_ID, kid: hostKey.kid, keys_url: "/.well-known/olip-keys.json" });
  function keyBindings() {
    // Direct-topology professionals: the recipient intake key signs their receipts, so it is bound to them.
    const bindings = FX.PROFESSIONALS.filter((x) => FX.POLICIES[x.id]?.delivery?.topology === "direct").map((x) => {
      const rv = S.revokedBindings.get(x.id);
      return signObject({ olip_version: OLIP_V02, binding_id: `kbd_${x.id}`, subject: { professional_ids: [x.id], firm_id: x.firm.id, display_name: x.firm.name },
        key: { kty: key.publicJwk.kty, crv: key.publicJwk.crv, x: key.publicJwk.x, kid: key.kid, alg: "EdDSA", use: "sig" }, purposes: ["receipt", "recipient_event"],
        evidence: { method: "host_attestation", url: null, checked_at: "2026-11-06T12:00:00Z", evidence_sha256: null,
          statement: "MOCK: the fictional host states it checked this key with the fictional firm. host_attestation is the weakest evidence method; production bindings SHOULD use firm_domain_wellknown or licensing_authority_record." },
        valid_from: "2026-11-01T00:00:00Z", valid_until: "2027-11-01T00:00:00Z", status: rv ? "revoked" : "active", revoked_at: rv ? rv.at : null, revocation_reason: rv ? rv.reason : null, supersedes: null,
        issuer: issuer(), issued_at: "2026-11-06T12:00:00Z" }, hostKey);
    });
    return { olip_version: OLIP_V02, issuer: issuer(), generated_at: iso(), max_age_seconds: 300, bindings };
  }
  function intakeCard(id, base) {
    const x = prof(id), pol = FX.POLICIES[id];
    if (!x || !pol) return null;
    const direct = pol.delivery?.topology != null && x.intake_endpoint.status === "active";
    const confirmed = pol.updated_at;
    const card = { $schema: "https://olip.ai/spec/0.2/schemas/intake-capability-card.json", schema: "olip-intake-capability-card/0.2", olip_version: OLIP_V02,
      card_id: `card_${id}`, canonical_url: `${base}/olip/v0.2/professionals/${id}/intake-card`,
      host: { name: "OLIP reference mock host (fictional)", role: "hosting_provider", note: "A firm may publish the same card on its own site. No account, subscription or payment with any host is needed to publish or read a card." },
      subject: { lawyer_id: id, professional_id: id, name: x.display_name, firm_name: x.firm.name, profile_url: null, identity_verification: "not_performed" },
      official_evidence: { licenses: x.licenses.map((l) => ({ jurisdiction: l.jurisdiction, license_id: l.license_id, status: l.status.value,
        authority_record_url: l.verification.source.url, as_of: l.status.as_of, check_basis: l.verification.level === "official_source_checked" ? "fresh_check_at_source" : "copy_of_official_records" })),
        label: "Copied from the (fictional) licensing record on the date shown. A license does not show competence or availability." },
      firm_reported: { label: "Stated by the firm and dated. Not verified by the host.",
        matter_types: (pol.matter_types || []).map((m) => ({ label: m.label || m.code, taxonomy: "olip-taxonomy/0.1", sali_iri: null, mapping: "unmapped_pending_review" })),
        jurisdictions_served: pol.jurisdictions || [], languages: (pol.languages || []).map((l) => ({ language: l, as_of: confirmed })),
        acceptance_criteria: (pol.client_side || []).map((c) => `Represents: ${c}`), communication_methods: direct ? ["olip_handoff"] : [],
        availability: { status: pol.accepting_new_matters.value === true ? "firm_reported" : "unknown", as_of: pol.accepting_new_matters.as_of || null, label: "The firm says so; not checked." },
        consultation_terms: [{ status: "not_published" }], last_confirmed_by: "lawyer_at_firm" },
      intake: { accepts_inquiries: direct, methods: direct ? ["olip/0.1 handoff", "olip/0.2 status webhooks"] : [],
        endpoint: direct ? { discovery: `${base}/.well-known/olip.json`, submit: `${base}/olip/v0.1/handoffs`, status: `${base}/olip/v0.1/handoffs/{handoff_id}` } : null,
        status_callbacks: direct ? ["sent", "delivered", "failed", "acknowledged", "declined", "consultation_confirmed"] : [], callback_auth: direct ? "OLIP 0.2 signed webhooks (EdDSA, 300-second window, webhook_id deduplicated)" : null,
        approved_question_count: 0, human_review: "A person at the firm decides conflicts and whether to take a matter. An inquiry does not create an attorney-client relationship.",
        fallback: "Contact the office directly or use the official license record." },
      policy_url: `${base}/olip/v0.1/professionals/${id}/intake-policy`,
      lifecycle: { published: true, published_at: confirmed, last_confirmed_at: confirmed, expires_at: new Date(new Date(confirmed).getTime() + 90 * 86400000).toISOString(), stale: !!pol.stale },
      not_included: ["quality or match scores", "rankings", "response or win rates", "payment or subscription status"], quarantined_fields: [], generated_at: iso() };
    const signed = signObject(card, hostKey);
    return { ...signed, signature: { ...signed.signature, keys_url: "/.well-known/olip-keys.json" } };
  }
  function subscribe(ctx, p) {
    const h = S.handoffs.get(p.handoff_id);
    if (!h || !canSee(ctx, h) || ctx.principal.kind !== "client") return err(404, "OLIP_NOT_FOUND", "No such handoff.");
    const u = String(p.callback_url || "");
    if (!/^https:\/\/[^\s]+$/.test(u) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u)) return err(400, "OLIP_INVALID_REQUEST", "callback_url must be https (http is allowed only for 127.0.0.1 or localhost in mock mode).");
    const subs = S.subscriptions.get(h.handoff_id) || [];
    if (subs.length >= 3) return err(400, "OLIP_INVALID_REQUEST", "At most 3 subscriptions per handoff.");
    const sub = { olip_version: OLIP_V02, subscription_id: newId("sub"), handoff_id: h.handoff_id, callback_url: u, created_at: iso(), status: "active",
      signing: { alg: "EdDSA", kid: hostKey.kid, keys_url: "/.well-known/olip-keys.json", max_clock_skew_seconds: 300 }, max_attempts: MAX_ATTEMPTS,
      statement: "Webhooks are hints. The status of record is what get_handoff_status returns. Verify every signature, reject old or repeated webhooks." };
    subs.push(sub); S.subscriptions.set(h.handoff_id, subs);
    track("subscribe_status_webhook", "ok", ctx);
    return ok({ subscription: structuredClone(sub) }, 201);
  }
  async function dispatchWebhooks(handoff_id, ev) {
    for (const sub of S.subscriptions.get(handoff_id) || []) {
      if (sub.status === "cancelled") continue;
      const webhook_id = newId("whk");
      let delivered = false;
      for (let attempt = 1; attempt <= sub.max_attempts && !delivered; attempt++) {
        const body = signObject({ olip_version: OLIP_V02, webhook_id, subscription_id: sub.subscription_id, handoff_id, sent_at: iso(), attempt, event: ev, state_after: ev.to_state }, hostKey);
        const rec = { webhook_id, subscription_id: sub.subscription_id, attempt, body, outcome: "pending", http_status: null };
        S.webhooks.push(rec);
        try {
          const r = await fetch(sub.callback_url, { method: "POST", headers: { "content-type": "application/json", "olip-version": OLIP_V02, "olip-webhook-id": webhook_id }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
          rec.http_status = r.status; rec.outcome = r.status >= 200 && r.status < 300 ? "accepted" : "rejected"; delivered = rec.outcome === "accepted";
        } catch { rec.outcome = "unreachable"; }
      }
      if (!delivered) sub.status = "failing";
    }
  }

  function manifest(base) {
    const op = (name, method, path, auth) => ({ name, method, path, auth });
    return { olip_version: OLIP_VERSION, supported_versions: [OLIP_VERSION, OLIP_V02],
      implementation: { name: "OLIP reference mock server", version: "0.1.0-draft", mode: "mock", fictional_data_only: true, operator: "Digital Crossings Inc. (sponsor of the draft; conformance does not require Digital Crossings Inc.)" },
      profiles: ["olip-read", "olip-write", "olip-mock-harness", "olip-a2a-binding"],
      operations: [
        op("discover_providers", "GET", "/olip/v0.1/providers", "none"), op("get_professional_identity", "GET", "/olip/v0.1/professionals/{id}", "none"),
        op("get_intake_policy", "GET", "/olip/v0.1/professionals/{id}/intake-policy", "none"), op("prepare_or_validate_casebrief", "POST", "/olip/v0.1/casebriefs/validate", "client"),
        op("create_casebrief", "POST", "/olip/v0.1/casebriefs", "client"), op("update_casebrief", "PUT", "/olip/v0.1/casebriefs/{id}", "client"),
        op("delete_casebrief", "DELETE", "/olip/v0.1/casebriefs/{id}", "client"), op("export_casebrief", "GET", "/olip/v0.1/casebriefs/{id}/export", "client"),
        op("preview_handoff", "POST", "/olip/v0.1/handoff-previews", "client"), op("get_handoff_preview", "GET", "/olip/v0.1/handoff-previews/{id}", "client"),
        op("revoke_handoff_preview", "POST", "/olip/v0.1/handoff-previews/{id}/revoke", "client"), op("submit_approved_handoff", "POST", "/olip/v0.1/handoffs", "client"),
        op("get_handoff_status", "GET", "/olip/v0.1/handoffs/{id}", "client_or_recipient"), op("cancel_when_possible", "POST", "/olip/v0.1/handoffs/{id}/cancel", "client"),
        op("record_recipient_event", "POST", "/olip/v0.1/handoffs/{id}/events", "recipient"),
      ],
      auth: { token_endpoint: "/oauth/token", grant_types: ["client_credentials"], token_type: "Bearer", token_ttl_seconds: TOKEN_TTL_S },
      user_approval_methods: ["hosted_otp"],
      keys_url: "/.well-known/olip-keys.json",
      bindings: { https: "/olip/v0.1", a2a_agent_card: "/.well-known/agent-card.json", mcp: "agent-side adapter: reference/mcp-adapter.mjs (works with any OLIP endpoint)" },
      status_machine: "/olip/v0.1/status-machine",
      extensions_supported: [],
      features_0_2: { olip_version: OLIP_V02, features: ["key_bindings", "status_webhooks", "intake_cards"], key_bindings_url: "/.well-known/olip-key-bindings.json",
        operations: [op("get_key_bindings", "GET", "/olip/v0.2/key-bindings", "none"), op("get_intake_card", "GET", "/olip/v0.2/professionals/{id}/intake-card", "none"), op("subscribe_status_webhook", "POST", "/olip/v0.2/handoffs/{id}/subscriptions", "client")] },
      spec: { url: "https://olip.ai/spec/0.2/", sha256: SPEC_SHA256 },
      limitations: ["Fictional reference mock: every professional, firm and message is test data.", "Key bindings use host_attestation only.", "Webhook delivery is in-process with at most 3 attempts."],
      mock_hooks: { fixtures: "/mock/fixtures", inbox: "/mock/inbox?address=", clock: "/mock/clock", analytics: "/mock/analytics", logs: "/mock/logs", deliveries: "/mock/deliveries", reset: "/mock/reset", webhooks: "/mock/webhooks", revoke_key_binding: "/mock/revoke-key-binding" } };
  }
  function agentCard(base) {
    return { protocolVersion: "0.3.0", name: "OLIP reference mock (fictional data)", description: "Legal-intake operations defined by the OLIP 0.1 draft. Test data only.", url: `${base}/a2a`, version: "0.1.0-draft",
      preferredTransport: "JSONRPC", capabilities: { streaming: false, pushNotifications: false }, defaultInputModes: ["application/json"], defaultOutputModes: ["application/json"],
      securitySchemes: { olip_client: { type: "oauth2", flows: { clientCredentials: { tokenUrl: `${base}/oauth/token`, scopes: { "olip.read": "read", "olip.write": "write" } } } } },
      skills: Object.keys(ops).filter((n) => n !== "record_recipient_event").map((n) => ({ id: `olip.${n}`, name: n, description: `OLIP operation ${n}. Send a DataPart {olip_operation: "${n}", params: {...}}.`, tags: ["legal-intake", "olip"] })) };
  }

  async function readBody(req) {
    const chunks = []; let n = 0;
    for await (const c of req) { n += c.length; if (n > 256 * 1024) throw Object.assign(new Error("too large"), { status: 413 }); chunks.push(c); }
    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw) return {};
    if ((req.headers["content-type"] || "").includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(raw));
    try { return JSON.parse(raw); } catch { throw Object.assign(new Error("bad json"), { status: 400 }); }
  }
  function send(res, status, body, type = "application/json") {
    res.writeHead(status, { "content-type": type === "application/json" ? "application/json; charset=utf-8" : type, "cache-control": "no-store", "x-content-type-options": "nosniff", "olip-version": OLIP_VERSION,
      ...(type.startsWith("text/html") ? { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'", "x-frame-options": "DENY" } : {}) });
    res.end(type === "application/json" ? JSON.stringify(body) : body);
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://local");
    const path = url.pathname; const base = `http://${req.headers.host}`;
    let status = 500;
    const done = (s, b, t) => { status = s; send(res, s, b, t); };
    try {
      const v = req.headers["olip-version"];
      if (v && !/^0\.[12](\.\d+)?$/.test(v)) return done(400, { olip_version: OLIP_VERSION, error: { code: "OLIP_VERSION_UNSUPPORTED", message: `OLIP version ${v} is not supported.`, retryable: false, supported_versions: [OLIP_VERSION, OLIP_V02] } });
      const body = ["POST", "PUT", "PATCH"].includes(req.method) ? await readBody(req) : {};
      let m0;
      if (req.method === "GET" && path === "/.well-known/olip.json") return done(200, manifest(base));
      if (req.method === "GET" && path === "/.well-known/olip-keys.json") return done(200, jwks());
      if (req.method === "GET" && (path === "/.well-known/olip-key-bindings.json" || path === "/olip/v0.2/key-bindings")) return done(200, keyBindings());
      if (req.method === "GET" && (m0 = path.match(/^\/olip\/v0\.2\/professionals\/([\w-]+)\/intake-card$/))) { const c = intakeCard(m0[1], base); return c ? done(200, c) : done(404, { olip_version: OLIP_V02, error: { code: "OLIP_NOT_FOUND", message: "No intake card for that id.", retryable: false } }); }
      if (req.method === "GET" && path === "/.well-known/agent-card.json") return done(200, agentCard(base));
      if (req.method === "GET" && path === "/olip/v0.1/status-machine") return done(200, STATUS_MACHINE);
      if (req.method === "POST" && path === "/oauth/token") { const r = issueToken(body); return done(r.status, r.body); }
      // user approval page
      let m;
      if ((m = path.match(/^\/olip\/v0\.1\/approvals\/([\w-]+)(\/send-code|\/confirm)?$/))) {
        const pv = S.previews.get(m[1]);
        if (!pv) return done(404, { error: { code: "OLIP_NOT_FOUND", message: "Unknown approval link." } });
        if (req.method === "GET" && !m[2]) { if (url.searchParams.get("k") !== pv._k) return done(404, { error: { code: "OLIP_NOT_FOUND", message: "Unknown approval link." } }); return done(200, approvalPage(pv, pv._k), "text/html; charset=utf-8"); }
        const r = m[2] === "/send-code" ? approvalSendCode(pv, body.k) : approvalConfirm(pv, body);
        return done(r.status, r.body);
      }
      // mock harness hooks (never present outside mock mode)
      if (path.startsWith("/mock/")) return done(...mockHook(req.method, path, url, body));
      if (path === "/a2a" && req.method === "POST") return done(200, await a2a(req, body));
      for (const [method, re, map] of routes) {
        if (req.method !== method) continue;
        const mm = path.match(re); if (!mm) continue;
        const [opName, params] = map(Object.fromEntries(url.searchParams), mm, body, req);
        let ctx = { principal: null };
        if (!PUBLIC_OPS.has(opName)) { const a = authenticate(req); if (a.error) return done(a.error.status, a.error.body); ctx = { principal: a.principal }; }
        const r = ops[opName](ctx, params || {}, { idempotency_key: req.headers["idempotency-key"] });
        return done(r.status, r.body);
      }
      return done(404, { olip_version: OLIP_VERSION, error: { code: "OLIP_NOT_FOUND", message: "No such operation.", retryable: false } });
    } catch (e) {
      return done(e.status || 500, { olip_version: OLIP_VERSION, error: { code: e.status === 413 ? "OLIP_PAYLOAD_TOO_LARGE" : e.status === 400 ? "OLIP_INVALID_REQUEST" : "OLIP_INTERNAL", message: e.status ? e.message : "Internal error.", retryable: !e.status } });
    } finally {
      // Access log: method, route shape and status only. No query strings, bodies or headers.
      S.logs.push(`${iso()} ${req.method} ${path.replace(/\/(cbr|prv|hnd|auz|prf|frm)_[\w-]+/g, "/$1_*")} ${status}`);
    }
  });

  async function a2a(req, body) {
    const id = body.id ?? null;
    const rpcErr = (code, message, data) => ({ jsonrpc: "2.0", id, error: { code, message, data } });
    if (body.jsonrpc !== "2.0" || body.method !== "message/send") return rpcErr(-32601, "Only message/send is supported.");
    const part = body.params?.message?.parts?.find((p) => p.kind === "data");
    const opName = part?.data?.olip_operation;
    if (!opName || !ops[opName] || opName === "record_recipient_event") return rpcErr(-32602, "Send a DataPart with a known olip_operation.");
    let ctx = { principal: null };
    if (!PUBLIC_OPS.has(opName)) { const a = authenticate(req); if (a.error) return rpcErr(-32001, a.error.body.error.message, a.error.body); ctx = { principal: a.principal }; }
    const r = ops[opName](ctx, part.data.params || {}, { idempotency_key: part.data.idempotency_key });
    return { jsonrpc: "2.0", id, result: { kind: "message", role: "agent", messageId: newId("msg"), parts: [{ kind: "data", data: { http_status: r.status, ...r.body } }] } };
  }

  function mockHook(method, path, url, body) {
    if (method === "GET" && path === "/mock/fixtures") return [200, {
      professionals: { direct_ok: "prf_test_alvarez", indexed_only_no_endpoint: "prf_test_brooks", relay_email: "prf_test_chen", offline: "prf_test_okafor", gate_no_listing_agreement: "prf_test_reyes", verified: "prf_test_alvarez", nonpaying_endpoint: "prf_test_alvarez" },
      clients: { a: { client_id: "cli_agent_a", client_secret: FX.CLIENTS.cli_agent_a.secret }, b: { client_id: "cli_agent_b", client_secret: FX.CLIENTS.cli_agent_b.secret } },
      recipients: { direct_ok: { client_id: "frm_test_alvarez", client_secret: FX.RECIPIENT_CREDENTIALS.frm_test_alvarez.secret }, relay_email: { client_id: "frm_test_chen", client_secret: FX.RECIPIENT_CREDENTIALS.frm_test_chen.secret } },
      jurisdiction_supported: "US-CA", matter_supported: "housing.landlord_tenant", jurisdictions: { offline: "US-NY", relay_email: "US-NY" }, no_match_jurisdiction: "US-WY" }];
    if (method === "GET" && path === "/mock/inbox") return [200, { messages: S.inbox.get(String(url.searchParams.get("address") || "").toLowerCase()) || [] }];
    if (method === "POST" && path === "/mock/clock") { clockOffsetMs += Number(body.advance_seconds || 0) * 1000; return [200, { now: iso() }]; }
    if (method === "GET" && path === "/mock/analytics") return [200, { events: S.analytics }];
    if (method === "GET" && path === "/mock/logs") return [200, { lines: S.logs }];
    if (method === "GET" && path === "/mock/deliveries") return [200, { by_recipient: Object.fromEntries(S.deliveries) }];
    if (method === "GET" && path === "/mock/webhooks") return [200, { webhooks: S.webhooks }];
    if (method === "POST" && path === "/mock/revoke-key-binding") { S.revokedBindings.set(String(body.professional_id), { at: iso(), reason: "key_compromise" }); return [200, { revoked: String(body.professional_id) }]; }
    if (method === "POST" && path === "/mock/reset") { reset(); clockOffsetMs = 0; return [200, { reset: true }]; }
    return [404, { error: { code: "OLIP_NOT_FOUND", message: "Unknown mock hook." } }];
  }

  return { server, ops, reset };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8787);
  const { server } = createOlipServer({ mode: process.env.OLIP_MODE || "mock" });
  server.listen(port, "127.0.0.1", () => console.log(`OLIP reference mock server (fictional data) on http://127.0.0.1:${port}`));
}
