// OLIP 2.0-draft TypeScript client SDK. PROPOSED, NOT ADOPTED. Framework-independent: uses only fetch and WebCrypto.
// No sponsor account, key or service is needed. Works against any host that implements the draft lifecycle profiles.
// The SDK never approves anything: approvals happen on the host's user-facing approval page.

export const OLIP_V2 = "2.0-draft";
export const LIFECYCLE_EXTENSION = "olip.ai/lifecycle-capabilities/2.0-draft";
export const LIFECYCLE_PROFILES = ["olip-lifecycle-core/2", "olip-consultation/2", "olip-engagement/2", "olip-communications/2", "olip-matter/2"] as const;
export type Profile = (typeof LIFECYCLE_PROFILES)[number];

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export interface Jwk { kty: string; crv: string; x: string; kid: string; alg?: string; status?: string; revoked_at?: string; revocation_reason?: string; olip_key_purpose?: string }
export interface Signed { signature: { alg: "EdDSA"; kid: string; value: string } }
export interface OlipErrorBody { olip_version: string; error: { code: string; message: string; retryable: boolean; [k: string]: unknown } }

export class OlipError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly body?: unknown) { super(`${code}: ${message}`); this.name = "OlipError"; }
}

// ---------- canonical JSON (same rules as OLIP 1.0 section 9.1: sorted keys, integers only, no whitespace) ----------
export function canonicalize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") { if (!Number.isInteger(value)) throw new Error("OLIP canonical JSON allows integers only"); return String(value); }
  if (Array.isArray(value)) return "[" + value.map((v) => canonicalize(v === undefined ? null : v)).join(",") + "]";
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const keys = Object.keys(o).filter((k) => o[k] !== undefined).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(o[k])).join(",") + "}";
  }
  throw new Error("Unsupported value in canonical JSON");
}
const te = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export async function sha256(s: string): Promise<string> { return "sha256:" + hex(await crypto.subtle.digest("SHA-256", te.encode(s))); }
export const digestOf = (v: unknown) => sha256(canonicalize(v));
const b64url = (s: string) => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

/** Verifies an OLIP detached Ed25519 signature (canonical JSON of the object without its signature member). */
export async function verifyDetached(obj: Signed & Record<string, unknown>, keys: Jwk[]): Promise<{ ok: boolean; reason?: string }> {
  if (!obj?.signature) return { ok: false, reason: "missing_signature" };
  const { signature, ...body } = obj;
  if (signature.alg !== "EdDSA") return { ok: false, reason: "unsupported_alg" };
  const jwk = keys.find((k) => k.kid === signature.kid);
  if (!jwk) return { ok: false, reason: "unknown_kid" };
  try {
    const key = await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwk.x }, { name: "Ed25519" }, false, ["verify"]);
    const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, b64url(signature.value), te.encode(canonicalize(body)));
    return ok ? { ok: true } : { ok: false, reason: "bad_signature" };
  } catch { return { ok: false, reason: "bad_signature" }; }
}

/** Receiver-side webhook check: host signature, 300-second window, no repeated webhook_id. A webhook is a hint; read the status of record. */
export async function checkWebhook(body: Signed & { webhook_id: string; sent_at: string } & Record<string, unknown>, hostKeys: Jwk[], opts: { seen: Set<string>; now?: number; maxSkewSeconds?: number }) {
  const v = await verifyDetached(body, hostKeys);
  if (!v.ok) return v;
  if (Math.abs((opts.now ?? Date.now()) - Date.parse(body.sent_at)) > (opts.maxSkewSeconds ?? 300) * 1000) return { ok: false, reason: "stale_or_future_timestamp" };
  if (opts.seen.has(body.webhook_id)) return { ok: false, reason: "replayed_webhook_id" };
  opts.seen.add(body.webhook_id);
  return { ok: true };
}

export interface Capabilities { lifecycle: boolean; profiles: Profile[]; olip1Versions: string[]; base_path?: string; raw?: unknown; statement: string }
export interface Approval { approval_id: string; approval_url: string; grant_id: string; grant_digest: string; expires_at: string; state: string; instructions: string }

/** Lifecycle client. One instance per host. Tokens are held in memory only. */
export class OlipLifecycleClient {
  private token: string | null = null;
  private caps: Capabilities | null = null;
  constructor(public readonly base: string, private readonly opts: { fetch?: typeof fetch } = {}) {}
  private get f() { return this.opts.fetch ?? fetch; }
  useToken(t: string | null) { this.token = t; return this; }

  async request<T = any>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: T }> {
    const h: Record<string, string> = { accept: "application/json", ...headers };
    if (body !== undefined) h["content-type"] = "application/json";
    if (this.token && !h.authorization) h.authorization = `Bearer ${this.token}`;
    if (method !== "GET" && !h["idempotency-key"]) h["idempotency-key"] = crypto.randomUUID();
    const r = await this.f(this.base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    let parsed: any = null; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: r.status, body: parsed };
  }
  private async must<T = any>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
    const r = await this.request<T>(method, path, body, headers);
    if (r.status >= 400) { const e = (r.body as any)?.error; throw new OlipError(r.status, e?.code ?? "OLIP_HTTP_ERROR", e?.message ?? `HTTP ${r.status}`, r.body); }
    return r.body;
  }

  /** Capability negotiation. A 1.0-only peer returns lifecycle=false; lifecycle methods then fail locally with OLIP_PROFILE_NOT_SUPPORTED. */
  async negotiate(): Promise<Capabilities> {
    const v1 = await this.request("GET", "/.well-known/olip.json");
    const olip1Versions: string[] = v1.status === 200 ? (v1.body?.supported_versions ?? []) : [];
    const lc = await this.request("GET", "/.well-known/olip-lifecycle.json");
    const advertised = v1.status === 200 && (v1.body?.extensions_supported ?? []).includes(LIFECYCLE_EXTENSION);
    if (lc.status === 200 && lc.body?.olip_version === OLIP_V2 && (advertised || v1.status !== 200)) {
      const profiles = (lc.body.profiles ?? []).filter((p: string) => (LIFECYCLE_PROFILES as readonly string[]).includes(p)) as Profile[];
      this.caps = { lifecycle: true, profiles, olip1Versions, base_path: lc.body.base_path, raw: lc.body, statement: lc.body.statement };
    } else this.caps = { lifecycle: false, profiles: [], olip1Versions, statement: "This endpoint offers no OLIP 2.0-draft lifecycle profiles. Use only its OLIP 1.0 operations." };
    return this.caps;
  }
  private need(p: Profile) {
    if (!this.caps) throw new OlipError(0, "OLIP_NOT_NEGOTIATED", "Call negotiate() first.");
    if (!this.caps.lifecycle || !this.caps.profiles.includes(p)) throw new OlipError(0, "OLIP_PROFILE_NOT_SUPPORTED", `The endpoint does not offer ${p}. Not calling it.`);
  }

  // ---- identity ----
  async userSession(subject_id: string, password: string) { this.token = null; const r = await this.must("POST", "/olip/v2/user-sessions", { subject_id, password }); this.token = r.session_token; return r; }
  async delegateAgent(client_id: string, content_access: boolean) { return this.must("POST", "/olip/v2/agent-delegations", { client_id, content_access }); }
  async agentToken(client_id: string, client_secret: string, code: string) { this.token = null; const r = await this.must("POST", "/olip/v2/token", { grant_type: "urn:olip:params:oauth:grant-type:delegation_code", client_id, client_secret, code }); this.token = r.access_token; return r; }
  async clientCredentials(client_id: string, client_secret: string) { this.token = null; const r = await this.must("POST", "/olip/v2/token", { grant_type: "client_credentials", client_id, client_secret }); this.token = r.access_token; return r; }

  // ---- core / intake ----
  async recipients(q: { jurisdiction?: string; matter?: string } = {}) { this.need("olip-lifecycle-core/2"); return this.must("GET", `/olip/v2/recipients?${new URLSearchParams(q as Record<string, string>)}`); }
  async intakeQuestions(org: string, stage: "screening" | "casebrief") { this.need("olip-lifecycle-core/2"); return this.must("GET", `/olip/v2/recipients/${encodeURIComponent(org)}/intake-questions?stage=${stage}`); }
  async createMatter(casebrief: Json, opts: { fictional?: boolean } = {}) { this.need("olip-lifecycle-core/2"); return this.must("POST", "/olip/v2/matters", { casebrief, fictional: opts.fictional ?? true }); }
  async getMatter(id: string) { this.need("olip-lifecycle-core/2"); return this.must("GET", `/olip/v2/matters/${id}`); }
  async requestConflictScreen(matterId: string, organization_id: string, fields: string[]) { this.need("olip-lifecycle-core/2"); return this.must<{ conflict_screen: any; approval: Approval }>("POST", `/olip/v2/matters/${matterId}/conflict-screens`, { organization_id, fields, selection: { by: "user" } }); }
  async submitConflictScreen(screenId: string, a: Pick<Approval, "grant_id" | "grant_digest">) { return this.must("POST", `/olip/v2/conflict-screens/${screenId}/submit`, { grant_id: a.grant_id, grant_digest: a.grant_digest }); }
  async getConflictScreen(id: string) { return this.must("GET", `/olip/v2/conflict-screens/${id}`); }
  async requestCasebriefDisclosure(matterId: string, organization_id: string, fields: string[]) { return this.must<{ approval: Approval }>("POST", `/olip/v2/matters/${matterId}/disclosures`, { organization_id, fields }); }
  async submitCasebriefDisclosure(matterId: string, a: Pick<Approval, "grant_id" | "grant_digest">) { return this.must("POST", `/olip/v2/matters/${matterId}/disclosures/submit`, { grant_id: a.grant_id, grant_digest: a.grant_digest }); }

  // ---- consultation ----
  async requestConsultation(matterId: string, organization_id: string, preferences: { modes?: string[]; timezone?: string; note?: string }) { this.need("olip-consultation/2"); return this.must<{ consultation: any; approval: Approval }>("POST", `/olip/v2/matters/${matterId}/consultations`, { organization_id, preferences }); }
  async submitConsultation(id: string, a: Pick<Approval, "grant_id" | "grant_digest">) { this.need("olip-consultation/2"); return this.must("POST", `/olip/v2/consultations/${id}/submit`, a); }
  async proposeSlot(id: string, slot_id: string) { this.need("olip-consultation/2"); return this.must<{ approval: Approval }>("POST", `/olip/v2/consultations/${id}/proposals`, { slot_id }); }
  async submitProposal(id: string, a: Pick<Approval, "grant_id" | "grant_digest">) { this.need("olip-consultation/2"); return this.must("POST", `/olip/v2/consultations/${id}/proposals/submit`, a); }
  async getConsultation(id: string) { this.need("olip-consultation/2"); return this.must("GET", `/olip/v2/consultations/${id}`); }

  // ---- engagement ----
  async getEngagement(id: string) { this.need("olip-engagement/2"); return this.must("GET", `/olip/v2/engagements/${id}`); }
  async prepareEngagementResponse(engagementId: string, offer_digest: string) { this.need("olip-engagement/2"); return this.must<{ approval: Approval }>("POST", `/olip/v2/engagement-offers/${engagementId}/responses`, { offer_digest }); }

  // ---- communications ----
  async createThread(matterId: string, organization_id: string, purpose = "pre_engagement") { this.need("olip-communications/2"); return this.must("POST", `/olip/v2/matters/${matterId}/threads`, { organization_id, purpose }); }
  async draftMessage(threadId: string, body: string, attachments: string[] = []) { this.need("olip-communications/2"); return this.must<{ message: any; approval?: Approval }>("POST", `/olip/v2/threads/${threadId}/messages`, { body, attachments }); }
  async sendAuthorized(messageId: string, a: Pick<Approval, "grant_id" | "grant_digest">) { this.need("olip-communications/2"); return this.must("POST", `/olip/v2/messages/${messageId}/send`, a); }
  async messages(threadId: string, cursor?: string) { this.need("olip-communications/2"); return this.must("GET", `/olip/v2/threads/${threadId}/messages${cursor ? `?cursor=${cursor}` : ""}`); }

  // ---- matter ----
  async exportPassport(matterId: string) { this.need("olip-matter/2"); return this.must("POST", `/olip/v2/matters/${matterId}/exports`, {}); }
  async events(matterId: string) { this.need("olip-lifecycle-core/2"); return this.must("GET", `/olip/v2/matters/${matterId}/events`); }
  async hostKeys(): Promise<Jwk[]> { return (await this.must("GET", "/olip/v2/keys")).keys; }

  // ---- user-only approval surface (call with a USER session token, never an agent token) ----
  async getApproval(id: string) { return this.must("GET", `/olip/v2/approvals/${id}`); }
  async decide(id: string, decision: "approve" | "decline", otp: string, grant_digest: string) { return this.must("POST", `/olip/v2/approvals/${id}/decision`, { decision, otp, grant_digest }); }
}

/** Display text a client should show for an engagement. Never stronger than the evidence. */
export function engagementStatusText(e: { state: string; display_status?: { text: string; qualifier?: string } }): string {
  if (e.state === "firm_confirmed") return `Firm reports engagement confirmed. ${e.display_status?.qualifier ?? "OLIP does not create an attorney-client relationship."}`;
  return e.display_status?.text ?? e.state;
}
