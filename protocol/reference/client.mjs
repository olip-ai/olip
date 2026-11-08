// Minimal OLIP 0.1 HTTPS client (reference agent side). Works with any OLIP endpoint; nothing ESQ-specific.
import { verifyObject, canonicalize, sha256 } from "./lib/olip-core.mjs";
import { randomUUID } from "node:crypto";

export class OlipClient {
  constructor(base, creds = {}) { this.base = base.replace(/\/$/, ""); this.clientId = creds.clientId ?? creds.client_id; this.clientSecret = creds.clientSecret ?? creds.client_secret; this.token = null; }
  async req(method, path, body, headers = {}) {
    const h = { "content-type": "application/json", "olip-version": "0.1", ...headers };
    if (this.token) h.authorization = `Bearer ${this.token}`;
    const r = await fetch(this.base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let json; try { json = JSON.parse(text); } catch { json = { _text: text }; }
    return { status: r.status, body: json };
  }
  async login() {
    const r = await this.req("POST", "/oauth/token", { grant_type: "client_credentials", client_id: this.clientId, client_secret: this.clientSecret });
    if (r.status !== 200) throw new Error(`login failed: ${r.status}`);
    this.token = r.body.access_token; return r;
  }
  manifest() { return this.req("GET", "/.well-known/olip.json"); }
  keys() { return this.req("GET", "/.well-known/olip-keys.json"); }
  discover(params) { return this.req("GET", "/olip/v0.1/providers?" + new URLSearchParams(params)); }
  identity(id) { return this.req("GET", `/olip/v0.1/professionals/${id}`); }
  policy(id) { return this.req("GET", `/olip/v0.1/professionals/${id}/intake-policy`); }
  validate(casebrief, recipient_id) { return this.req("POST", "/olip/v0.1/casebriefs/validate", { casebrief, recipient_id }); }
  createBrief(casebrief) { return this.req("POST", "/olip/v0.1/casebriefs", { casebrief }); }
  getBrief(id) { return this.req("GET", `/olip/v0.1/casebriefs/${id}`); }
  updateBrief(id, casebrief, ifRevision) { return this.req("PUT", `/olip/v0.1/casebriefs/${id}`, { casebrief }, ifRevision != null ? { "if-match": `"${ifRevision}"` } : {}); }
  deleteBrief(id) { return this.req("DELETE", `/olip/v0.1/casebriefs/${id}`); }
  exportBrief(id) { return this.req("GET", `/olip/v0.1/casebriefs/${id}/export`); }
  preview(body) { return this.req("POST", "/olip/v0.1/handoff-previews", body); }
  getPreview(id) { return this.req("GET", `/olip/v0.1/handoff-previews/${id}`); }
  revokePreview(id) { return this.req("POST", `/olip/v0.1/handoff-previews/${id}/revoke`, {}); }
  submit(body, idempotencyKey = randomUUID()) { return this.req("POST", "/olip/v0.1/handoffs", body, { "idempotency-key": idempotencyKey }); }
  status(id) { return this.req("GET", `/olip/v0.1/handoffs/${id}`); }
  cancel(id) { return this.req("POST", `/olip/v0.1/handoffs/${id}/cancel`, {}); }
  recipientEvent(id, body) { return this.req("POST", `/olip/v0.1/handoffs/${id}/events`, body); }
}

// A receipt only counts as "delivered" evidence when its signature verifies against the recipient's published keys
// and it covers the payload and consent the user approved. A tool response that merely says "delivered" proves nothing.
export function checkReceipt(receipt, jwks, { consent_digest, payload }) {
  const sig = verifyObject(receipt, jwks);
  if (!sig.ok) return { ok: false, reason: sig.reason };
  if (receipt.consent_digest !== consent_digest) return { ok: false, reason: "consent_digest_mismatch" };
  if (payload && receipt.payload_sha256 !== sha256(canonicalize(payload))) return { ok: false, reason: "payload_mismatch" };
  return { ok: true };
}

// Plays the human in mock mode only: opens the approval page, asks for a code, reads the fictional inbox, confirms.
// A real agent can never do this, because the code goes to the user's own email.
export async function mockUserApproves(base, preview, email) {
  const u = new URL(preview.approval.url, base);
  const k = u.searchParams.get("k");
  const page = await fetch(u).then((r) => r.text());
  const digest = (page.match(/data-olip="consent_digest">([^<]+)</) || [])[1];
  const post = (p, b) => fetch(new URL(p, base), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const sent = await post(`${u.pathname}/send-code`, { k });
  if (sent.status !== 200) return { ok: false, step: "send-code", ...sent, page };
  const inbox = await fetch(new URL(`/mock/inbox?address=${encodeURIComponent(email)}`, base)).then((r) => r.json());
  const msg = inbox.messages.filter((m) => m.preview_id === preview.preview_id).at(-1);
  const conf = await post(`${u.pathname}/confirm`, { k, code: msg?.code, consent_digest: digest });
  return { ok: conf.status === 201, ...conf, page, digestOnPage: digest };
}
