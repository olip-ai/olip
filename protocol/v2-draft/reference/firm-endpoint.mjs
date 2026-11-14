// OLIP 2.0-draft FICTIONAL firm-owned endpoint. MOCK ONLY: in-memory, fictional staff, no real mail or calendar.
// It is the firm's own system: it receives disclosures, signs receipts, enforces its own staff roles, and signs
// the firm's lifecycle events. Nothing here needs the sponsor's services; any host that speaks OLIP 2.0-draft can use it.
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { V2, PROFILES, keyFromLabel, signDetached, digestOf, newId, safeEqual } from "./lib/core.mjs";

export function createFirmEndpoint({ firm, clock, host }) {
  // host: { call(method, path, body, headers) } — how this firm reaches the lifecycle host (HTTP for relay, in-process for direct).
  const rootKey = keyFromLabel(`${firm.organization_id}/root`, "organization_root");
  const eventKeys = [keyFromLabel(`${firm.organization_id}/events/1`)];
  let activeKey = eventKeys[0];
  const revoked = new Map(); // kid -> {revoked_at, reason}
  const staff = structuredClone(firm.staff);
  const delegations = structuredClone(firm.delegations || []);
  const inbox = [];
  const tokens = new Map();
  let hostToken = null;
  let authorityVersion = 1;
  const iso = () => clock.now().toISOString();

  function keysDoc() {
    return { olip_version: V2, organization_id: firm.organization_id, fictional: true,
      keys: [rootKey, ...eventKeys].map((k) => ({ ...k.publicJwk, status: revoked.has(k.kid) ? "revoked" : "active", valid_from: "2026-11-01T00:00:00Z", valid_until: "2027-11-01T00:00:00Z",
        ...(revoked.has(k.kid) ? { revoked_at: revoked.get(k.kid).revoked_at, revocation_reason: revoked.get(k.kid).reason } : {}) })) };
  }
  function authorityDoc() {
    return signDetached({ olip_version: V2, document: "firm_authority", organization_id: firm.organization_id, version: authorityVersion, issued_at: iso(), fictional: true,
      domain_control: { domain: firm.domain, method: "mock_dns_txt", status: "mock_only_not_verified" },
      actors: [...Object.values(staff).filter((s) => !s.revoked).map((s) => ({ actor_id: s.actor_id, kind: "staff", role: s.role, event_types: firm.role_permissions[s.role] })),
        ...delegations.filter((d) => !d.revoked).map((d) => ({ actor_id: d.actor_id, kind: d.kind, role: "delegated_adapter", event_types: d.event_types, expires_at: d.expires_at }))],
      event_signing_kids: eventKeys.filter((k) => !revoked.has(k.kid)).map((k) => k.kid) }, rootKey);
  }
  function profile() {
    return { olip_version: V2, release_status: "proposed_draft_not_adopted", organization_id: firm.organization_id, display_name: firm.display_name, fictional: true,
      jurisdictions: firm.jurisdictions, matter_types: firm.matter_types, timezone: firm.timezone, profiles: PROFILES,
      conflict_screening_fields: firm.conflict_screening_fields, casebrief_fields: firm.casebrief_fields, messaging_policy: firm.messaging_policy,
      scheduling: firm.scheduling, engagement_policy: firm.engagement_policy, olip_1_0_professional_ids: firm.olip_1_0_professional_ids,
      keys: keysDoc(), authority: authorityDoc(), statement: "Firm-reported configuration. Not verified by OLIP." };
  }

  // The firm's intake system signs a receipt for exactly what it stored.
  function receive(delivery, presentedSecret) {
    if (!safeEqual(presentedSecret, firm.inbox_secret)) return { status: 401, body: { olip_version: V2, error: { retryable: false, code: "OLIP_UNAUTHENTICATED", message: "Unknown host." } } };
    if (!delivery || typeof delivery !== "object" || !delivery.delivery_id) return { status: 400, body: { olip_version: V2, error: { retryable: false, code: "OLIP_INVALID_REQUEST", message: "delivery_id required." } } };
    const dup = inbox.find((d) => d.delivery.delivery_id === delivery.delivery_id);
    if (dup) return { status: 200, body: { receipt: dup.receipt, duplicate: true } };
    const receipt = signDetached({ olip_version: V2, receipt_id: newId("rcp"), delivery_id: delivery.delivery_id, organization_id: firm.organization_id, kind: delivery.kind,
      payload_digest: digestOf(delivery.payload), received_at: iso(), statement: "The firm's intake system stored this exact content. Nobody has read or decided anything yet.", fictional: true }, activeKey);
    inbox.push({ delivery, receipt });
    return { status: 200, body: { receipt } };
  }

  async function hostCall(method, path, body, extra = {}, retried = false) {
    if (!hostToken) {
      const t = await host.call("POST", "/olip/v2/token", { grant_type: "client_credentials", client_id: firm.host_credentials.client_id, client_secret: firm.host_credentials.secret });
      hostToken = t.body.access_token;
    }
    const r = await host.call(method, path, body, { authorization: `Bearer ${hostToken}`, "idempotency-key": extra.idem || newId("idem"), ...(extra.headers || {}) });
    if (r.status === 401 && !retried) { hostToken = null; return hostCall(method, path, body, extra, true); }
    return r;
  }

  // Build and sign a firm event. The firm system enforces its own roles first; the host checks again independently.
  async function act(actorId, a) {
    const actor = staff[actorId] || delegations.find((d) => d.actor_id === actorId);
    if (!actor || actor.revoked) return { status: 403, body: { olip_version: V2, error: { retryable: false, code: "OLIP_FIRM_AUTHORITY_REQUIRED", message: "This staff account is not active at the firm." } } };
    const allowed = actor.role ? firm.role_permissions[actor.role] : actor.event_types;
    if (!a.skip_local_role_check && !allowed.includes(a.event_type)) return { status: 403, body: { olip_version: V2, error: { retryable: false, code: "OLIP_FIRM_AUTHORITY_REQUIRED", message: `Firm policy: ${actor.role || actor.kind} may not record ${a.event_type}.` } } };
    const cur = a.prior_revision !== undefined ? { body: { revision: a.prior_revision } } : await hostCall("GET", a.object_path);
    if (cur.status && cur.status >= 400) return cur;
    const rev = cur.body.revision ?? cur.body[Object.keys(cur.body).find((k) => cur.body[k]?.revision !== undefined)]?.revision;
    const event = signDetached({ olip_version: V2, event_id: `urn:olip:${firm.organization_id}:event:${randomBytes(9).toString("base64url")}`, matter_id: a.matter_id,
      object: a.object, event_type: a.event_type, actor: { role: "firm", actor_id: actorId, organization_id: firm.organization_id, staff_role: actor.role || "delegated_adapter" },
      prior_revision: rev ?? 0, occurred_at: a.occurred_at || iso(), idempotency_key: a.idem || newId("idem"), correlation_id: a.correlation_id || a.matter_id, causation_id: a.causation_id || null,
      evidence: a.evidence || {}, payload: a.payload || {}, fictional: true }, a.sign_with || activeKey);
    const r = await hostCall("POST", a.post_path, { event }, { idem: event.idempotency_key });
    return { ...r, event };
  }

  // ---------- HTTP surface ----------
  async function handle(method, path, headers, body) {
    const url = new URL(path, "http://firm.local");
    const p = url.pathname;
    if (method === "GET" && p === "/.well-known/olip-firm.json") return { status: 200, body: profile() };
    if (method === "GET" && p === "/firm/v2/keys") return { status: 200, body: keysDoc() };
    if (method === "GET" && p === "/firm/v2/authority") return { status: 200, body: authorityDoc() };
    if (method === "POST" && p === "/firm/v2/inbox") return receive(body?.delivery, String(headers.authorization || "").replace(/^Bearer /, ""));
    if (method === "POST" && p === "/firm/admin/login") {
      const s = staff[body?.actor_id] || delegations.find((d) => d.actor_id === body?.actor_id);
      if (!s || s.revoked || !safeEqual(String(body?.password || ""), s.password)) return { status: 401, body: { olip_version: V2, error: { retryable: false, code: "OLIP_UNAUTHENTICATED", message: "Wrong staff login." } } };
      const t = "fst_" + randomBytes(18).toString("base64url"); tokens.set(t, s.actor_id); return { status: 200, body: { staff_token: t, actor_id: s.actor_id } };
    }
    if (p.startsWith("/firm/admin/")) {
      const actorId = tokens.get(String(headers.authorization || "").replace(/^Bearer /, ""));
      const actor = actorId && (staff[actorId] || delegations.find((d) => d.actor_id === actorId));
      if (!actor || actor.revoked) return { status: 401, body: { olip_version: V2, error: { retryable: false, code: "OLIP_UNAUTHENTICATED", message: "Staff login required." } } };
      if (method === "GET" && p === "/firm/admin/inbox") return { status: 200, body: { deliveries: inbox.map((d) => ({ delivery: d.delivery, receipt_id: d.receipt.receipt_id })) } };
      if (method === "POST" && p === "/firm/admin/actions") return act(actorId, body);
      if (method === "POST" && p === "/firm/admin/host") return hostCall(body.method, body.path, body.body);
    }
    return { status: 404, body: { olip_version: V2, error: { retryable: false, code: "OLIP_NOT_FOUND", message: "Not found." } } };
  }

  const admin = {
    revokeStaff(actorId) { if (staff[actorId]) staff[actorId].revoked = true; for (const [t, a] of tokens) if (a === actorId) tokens.delete(t); authorityVersion++; },
    rotateKey() { const k = keyFromLabel(`${firm.organization_id}/events/${eventKeys.length + 1}`); eventKeys.push(k); activeKey = k; return k.kid; },
    revokeKey(kid, reason = "superseded") { revoked.set(kid, { revoked_at: iso(), reason }); if (activeKey.kid === kid) { const n = eventKeys.find((k) => !revoked.has(k.kid)); if (n) activeKey = n; else admin.rotateKey(); } authorityVersion++; },
    get activeKey() { return activeKey; }, get eventKeys() { return eventKeys; }, rootKey, inbox, act, hostCall,
  };

  const server = createServer(async (req, res) => {
    let raw = ""; for await (const c of req) { raw += c; if (raw.length > 1_000_000) { res.writeHead(413).end(); return; } }
    let body = null; try { body = raw ? JSON.parse(raw) : null; } catch { res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify({ olip_version: V2, error: { retryable: false, code: "OLIP_INVALID_REQUEST", message: "Body must be JSON." } })); return; }
    const r = await handle(req.method, req.url, req.headers, body);
    res.writeHead(r.status, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify(r.body));
  });
  return { firm, handle, server, admin, profile, keysDoc, authorityDoc };
}
