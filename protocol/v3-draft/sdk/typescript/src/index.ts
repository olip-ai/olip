// OLIP 3.0-draft agent client (PROPOSED, not adopted). Works with any OLIP 3.0-draft host; no sponsor account.
// Uses only fetch and WebCrypto (Ed25519, X25519, HKDF, AES-GCM). Node 20+ and modern browsers.
// What it cannot do, by design: approve anything for a user, or sign anything for a firm. Those happen elsewhere.

export const OLIP_V3 = "3.0-draft.1";
export const V3_EXTENSION = "olip.ai/agent-compatibility/3.0-draft";
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export interface Jwk { kty: string; crv?: string; x?: string; kid: string; alg?: string; status?: string; olip_key_purpose?: string; [k: string]: unknown }
export interface Signed { signature: { alg: "EdDSA"; kid: string; value: string } }
export type Disposition = "allowed_read_only" | "allowed" | "requires_user_approval" | "requires_firm_authority" | "blocked";
export interface PlannedAction { action: string; operation?: string; target?: Record<string, string>; disposition: Disposition; reason_code: string; missing_preconditions: string[] }
export interface Plan { workflow_id: string; as_of_event_sequence: number; next_actions: PlannedAction[]; not_authorization: true; not_legal_advice: true; policy_version: string; plan_digest: string }

export class OlipError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly body?: unknown) { super(`${code}: ${message}`); this.name = "OlipError"; }
  get retryable(): boolean { return (this.body as any)?.error?.retryable === true; }
}

// ---------- canonical JSON and digests (same rules as OLIP 1.0) ----------
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  const o = value as Record<string, unknown>;
  return "{" + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canonicalize(o[k])).join(",") + "}";
}
const te = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export async function sha256(s: string): Promise<string> { return "sha256:" + hex(await crypto.subtle.digest("SHA-256", te.encode(s))); }
export const digestOf = (v: unknown) => sha256(canonicalize(v));
const b64u = (s: string) => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

export async function verifyDetached(obj: Signed & Record<string, unknown>, keys: Jwk[]): Promise<{ ok: boolean; reason?: string }> {
  if (!obj || !obj.signature) return { ok: false, reason: "missing_signature" };
  const { signature, ...body } = obj;
  if (signature.alg !== "EdDSA") return { ok: false, reason: "unsupported_alg" };
  const jwk = keys.find((k) => k.kid === signature.kid);
  if (!jwk || !jwk.x) return { ok: false, reason: "unknown_kid" };
  try {
    const key = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwk.x }, { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, b64u(signature.value), te.encode(canonicalize(body)));
    return ok ? { ok: true } : { ok: false, reason: "bad_signature" };
  } catch { return { ok: false, reason: "bad_signature" }; }
}

// Verifies a page of journal entries: each entry's digest, its link to the previous one, and its signature.
export async function verifyJournal(entries: any[], keys: Jwk[], previousDigest = "sha256:" + "0".repeat(64)): Promise<{ ok: boolean; at?: number; reason?: string; last_digest: string }> {
  let prev = previousDigest;
  for (const e of entries) {
    const { signature, event_digest, ...rest } = e;
    if (e.previous_event_digest !== prev) return { ok: false, at: e.sequence, reason: "chain_gap", last_digest: prev };
    if ((await digestOf(rest)) !== event_digest) return { ok: false, at: e.sequence, reason: "digest_mismatch", last_digest: prev };
    if (!(await verifyDetached(e, keys)).ok) return { ok: false, at: e.sequence, reason: "bad_signature", last_digest: prev };
    prev = event_digest;
  }
  return { ok: true, last_digest: prev };
}

// Receiver-side webhook check: signature, clock skew and duplicate suppression.
export async function checkWebhook(body: Signed & { webhook_id: string; sent_at: string } & Record<string, unknown>, hostKeys: Jwk[], opts: { seen: Set<string>; now?: number; maxSkewSeconds?: number }) {
  const v = await verifyDetached(body, hostKeys);
  if (!v.ok) return { ok: false, reason: v.reason };
  const skew = Math.abs((opts.now ?? Date.now()) - Date.parse(body.sent_at)) / 1000;
  if (!(skew <= (opts.maxSkewSeconds ?? 300))) return { ok: false, reason: "stale" };
  if (opts.seen.has(body.webhook_id)) return { ok: false, reason: "duplicate" };
  opts.seen.add(body.webhook_id);
  return { ok: true };
}

// Opens a capsule that was encrypted to this assistant's X25519 key (ECDH-ES + HKDF-SHA256 + AES-256-GCM).
export async function openSealedCapsule(capsule: any, privateJwk: JsonWebKey & { x: string }): Promise<any> {
  const env = capsule.sealed_content;
  if (!env) throw new Error("capsule is not sealed");
  const priv = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "X25519", x: privateJwk.x, d: (privateJwk as any).d }, { name: "X25519" }, false, ["deriveBits"]);
  const pub = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "X25519", x: env.epk.x }, { name: "X25519" }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: "X25519", public: pub } as any, priv, 256);
  const hk = await crypto.subtle.importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: te.encode(env.epk.x + "." + privateJwk.x), info: te.encode("olip-3.0-draft capsule") }, hk, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const ct = b64u(env.ciphertext), tag = b64u(env.tag);
  const joined = new Uint8Array(ct.length + tag.length); joined.set(ct); joined.set(tag, ct.length);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64u(env.iv), additionalData: te.encode(env.aad), tagLength: 128 }, key, joined);
  const content = JSON.parse(new TextDecoder().decode(plain));
  if (capsule.encryption?.content_digest && (await digestOf(content)) !== capsule.encryption.content_digest) throw new Error("decrypted content does not match content_digest");
  return content;
}

const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_.:-]/g, "");

export class OlipAgentClient {
  token: string | null = null;
  manifestCache: any = null;
  constructor(public readonly base: string, private readonly opts: { fetch?: typeof fetch; token?: string } = {}) { this.token = opts.token ?? null; }
  setToken(t: string | null) { this.token = t; return this; }

  async request<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: T; headers: Record<string, string> }> {
    const f = this.opts.fetch ?? fetch;
    const r = await f(this.base + path, { method, headers: { ...(body != null ? { "content-type": "application/json" } : {}), ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...headers }, body: body != null ? JSON.stringify(body) : undefined });
    const text = await r.text(); let parsed: any = null; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    const h: Record<string, string> = {}; r.headers.forEach((v, k) => (h[k] = v));
    return { status: r.status, body: parsed, headers: h };
  }
  private async must<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
    const r = await this.request<any>(method, path, body, headers);
    if (r.status >= 400) throw new OlipError(r.status, r.body?.error?.code ?? "HTTP_" + r.status, r.body?.error?.message ?? "request failed", r.body);
    return r.body as T;
  }
  // Any action, by id. Mutating actions get a fresh Idempotency-Key unless you pass one (pass the SAME key to retry).
  async invoke<T = any>(actionId: string, input: Record<string, unknown> = {}, opts: { idempotencyKey?: string; correlationId?: string } = {}): Promise<T> {
    const headers: Record<string, string> = { "olip-version": OLIP_V3, "idempotency-key": opts.idempotencyKey ?? newKey() };
    if (opts.correlationId) headers["x-correlation-id"] = opts.correlationId;
    return this.must<T>("POST", `/olip/v3/actions/${encodeURIComponent(actionId)}/invoke`, input, headers);
  }
  // Retries only errors the host marks retryable, with the same Idempotency-Key and exponential backoff with jitter.
  async invokeWithRetry<T = any>(actionId: string, input: Record<string, unknown>, { attempts = 4, baseMs = 200, idempotencyKey = newKey() } = {}): Promise<T> {
    for (let i = 0; ; i++) {
      try { return await this.invoke<T>(actionId, input, { idempotencyKey }); }
      catch (e) { if (!(e instanceof OlipError) || !e.retryable || i + 1 >= attempts) throw e; await new Promise((r) => setTimeout(r, baseMs * 2 ** i * (0.5 + Math.random() / 2))); }
    }
  }

  async manifest(): Promise<any> { this.manifestCache = await this.must("GET", "/.well-known/olip-agent.json"); return this.manifestCache; }
  async keys(): Promise<Jwk[]> { return (await this.must<any>("GET", "/olip/v3/keys")).keys; }
  async verifiedManifest(): Promise<any> { const m = await this.manifest(); const v = await verifyDetached(m, await this.keys()); if (!v.ok) throw new OlipError(0, "UNVERIFIED_EVIDENCE", "manifest signature did not verify"); return m; }
  findProfessionals(q: { jurisdiction?: string; matter_type?: string } = {}) { return this.invoke("olip.find_professionals", q); }
  recipientPolicy(organization_id: string, stage: "screening" | "casebrief" = "screening") { return this.invoke("olip.get_recipient_policy", { organization_id, stage }); }
  checkCasebrief(casebrief: object) { return this.invoke("olip.prepare_casebrief", { casebrief }); }
  startWorkflow(casebrief: object, opts: { fictional?: boolean; idempotencyKey?: string } = {}) { return this.invoke("olip.start_workflow", { casebrief, fictional: opts.fictional !== false }, opts); }
  getWorkflow(workflow_id: string) { return this.invoke("olip.get_workflow", { workflow_id }); }
  listEvents(workflow_id: string, opts: { cursor?: string; last_seen_digest?: string; limit?: number } = {}) { return this.invoke("olip.list_workflow_events", { workflow_id, ...opts }); }
  previewDisclosure(workflow_id: string, organization_id: string, stage: "screening" | "casebrief", fields: string[], opts: { idempotencyKey?: string } = {}) { return this.invoke("olip.preview_disclosure", { workflow_id, organization_id, stage, fields }, opts); }
  submitApprovedDisclosure(disclosure: { disclosure_id: string; approval: { grant_id: string; grant_digest: string } }, opts: { idempotencyKey?: string } = {}) {
    return this.invoke("olip.submit_approved_disclosure", { disclosure_id: disclosure.disclosure_id, grant_id: disclosure.approval.grant_id, grant_digest: disclosure.approval.grant_digest }, opts);
  }
  cancelPending(disclosure_id: string) { return this.invoke("olip.cancel_pending_request", { disclosure_id }); }
  planNextActions(workflow_id: string, desired_goal?: string): Promise<Plan> { return this.invoke("olip.plan_next_actions", { workflow_id, ...(desired_goal ? { desired_goal } : {}) }); }
  exportCapsule(input: Record<string, unknown>, opts: { idempotencyKey?: string } = {}) { return this.invoke("olip.export_context_capsule", input, opts); }
  validateCapsule(capsule: object) { return this.invoke("olip.validate_context_capsule", { capsule }); }
  authorizeImport(capsule_id: string, capsule_digest: string, client_id: string) { return this.invoke("olip.authorize_capsule_import", { capsule_id, capsule_digest, client_id }); }
  importCapsule(capsule: object, import_authorization_id: string) { return this.invoke("olip.import_context_capsule", { capsule, import_authorization_id }); }
  importedCapsule(capsule_id: string) { return this.invoke("olip.get_imported_capsule", { capsule_id }); }
  revokeCapsule(capsule_id: string) { return this.invoke("olip.revoke_context_capsule", { capsule_id }); }
  subscribe(workflow_id: string, callback_url: string) { return this.invoke("olip.subscribe_events", { workflow_id, callback_url }); }
  unsubscribe(subscription_id: string) { return this.invoke("olip.cancel_subscription", { subscription_id }); }
  lifecycle(workflow_id: string, operation: string, object_id?: string, body?: Record<string, unknown>) { return this.invoke("olip.call_lifecycle", { workflow_id, operation, ...(object_id ? { object_id } : {}), ...(body ? { body } : {}) }); }

  // Resumes polling from a saved position, verifying every page's chain and signatures against the host's keys.
  async resume(workflow_id: string, saved: { cursor?: string; last_digest?: string } = {}) {
    const keys = await this.keys();
    const all: any[] = []; let cursor = saved.cursor; let last = saved.last_digest;
    for (;;) {
      const page: any = await this.listEvents(workflow_id, { ...(cursor ? { cursor } : {}), ...(last ? { last_seen_digest: last } : {}) });
      const v = await verifyJournal(page.entries, keys, last ?? "sha256:" + "0".repeat(64));
      if (!v.ok) throw new OlipError(0, "UNVERIFIED_EVIDENCE", `journal did not verify at ${v.at}: ${v.reason}`);
      all.push(...page.entries); cursor = page.next_cursor; last = v.last_digest;
      if (!page.has_more) return { entries: all, cursor, last_digest: last };
    }
  }
}
