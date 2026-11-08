// OLIP core helpers shared by the reference server and the reference client.
// No third-party dependencies. Node 20+.
import { createHash, generateKeyPairSync, sign, verify, createPublicKey, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const OLIP_VERSION = "0.1";
export const OLIP_V02 = "0.2"; // version of the 0.2 additions (key bindings, status webhooks, intake cards)
export const STATUS_MACHINE = JSON.parse(readFileSync(join(here, "../../spec/status-machine.json"), "utf8"));

// OLIP canonical JSON (spec section 9.1): object keys sorted by UTF-16 code unit, no whitespace,
// strings as JSON.stringify writes them, integers only (no floats in signed or digested content),
// undefined members dropped. This is the RFC 8785 subset that matters when no floats are present.
export function canonicalize(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isInteger(value)) throw new Error("OLIP canonical JSON allows integers only");
    return String(value);
  }
  if (Array.isArray(value)) return "[" + value.map((v) => canonicalize(v === undefined ? null : v)).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalize(value[k])).join(",") + "}";
  }
  throw new Error("Unsupported value in canonical JSON");
}

export const sha256 = (s) => "sha256:" + createHash("sha256").update(s).digest("hex");

// Spec section 6.3: the consent digest binds one recipient, one CaseBrief revision, the exact shared values,
// the purpose, the mode and the notice version. Any change produces a different digest.
export function consentDigest({ recipient_id, casebrief_id, casebrief_revision, purpose, mode, shared_fields, notice_version }) {
  const fields = [...shared_fields].map((f) => ({ path: f.path, value: f.value })).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return sha256(canonicalize({ olip_version: OLIP_VERSION, recipient_id, casebrief_id, casebrief_revision, purpose, mode, shared_fields: fields, notice_version }));
}

export function newKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const jwk = publicKey.export({ format: "jwk" });
  const kid = "k_" + randomBytes(6).toString("hex");
  return { kid, privateKey, publicJwk: { ...jwk, kid, alg: "EdDSA", use: "sig" } };
}

// Detached signature over canonical JSON of the object without its "signature" member.
export function signObject(obj, key) {
  const { signature, ...body } = obj;
  const value = sign(null, Buffer.from(canonicalize(body)), key.privateKey).toString("base64url");
  return { ...body, signature: { alg: "EdDSA", kid: key.kid, value } };
}

export function verifyObject(obj, jwks) {
  if (!obj || !obj.signature) return { ok: false, reason: "missing_signature" };
  const { signature, ...body } = obj;
  if (signature.alg !== "EdDSA") return { ok: false, reason: "unsupported_alg" };
  const jwk = (jwks.keys || []).find((k) => k.kid === signature.kid);
  if (!jwk) return { ok: false, reason: "unknown_kid" };
  try {
    const pub = createPublicKey({ key: { kty: jwk.kty, crv: jwk.crv, x: jwk.x }, format: "jwk" });
    const ok = verify(null, Buffer.from(canonicalize(body)), pub, Buffer.from(signature.value, "base64url"));
    return ok ? { ok: true } : { ok: false, reason: "bad_signature" };
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
}

export function findTransition(from, to, source) {
  const t = STATUS_MACHINE.transitions.find((x) => x.from === from && x.to === to);
  if (!t) return { ok: false, code: "OLIP_INVALID_TRANSITION", message: `No transition from ${from} to ${to}.` };
  if (!t.sources.includes(source)) return { ok: false, code: "OLIP_EVENT_SOURCE_FORBIDDEN", message: `${source} may not move a handoff from ${from} to ${to}.` };
  return { ok: true, transition: t };
}

export const isTerminal = (state) => STATUS_MACHINE.states[state]?.terminal === true;
export const wasTransmitted = (state) => STATUS_MACHINE.transmitted_states.includes(state);

export const newId = (prefix) => `${prefix}_${randomBytes(12).toString("base64url")}`;

// Read a dotted path such as "client.email" from a CaseBrief.
export function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// ---------- OLIP 0.2 client-side checks ----------
// A receipt (or recipient event) is attributable to the chosen recipient only if its kid has an ACTIVE binding
// to that recipient, valid at the time it was signed, and the binding itself verifies with the issuer's key.
export function checkKeyBinding(signedObj, recipient_id, bindingsDoc, jwks, at) {
  const kid = signedObj?.signature?.kid;
  const t = Date.parse(at);
  const cands = (bindingsDoc?.bindings || []).filter((b) => b.key?.kid === kid && b.subject?.professional_ids?.includes(recipient_id));
  if (!cands.length) return { ok: false, reason: "key_not_bound_to_recipient" };
  for (const b of cands) {
    const v = verifyObject(b, jwks);
    if (!v.ok) return { ok: false, reason: `binding_${v.reason}` };
    if (b.issuer?.kid !== b.signature?.kid) return { ok: false, reason: "binding_issuer_kid_mismatch" };
    if (b.status === "revoked" && (b.revoked_at == null || t >= Date.parse(b.revoked_at) || b.revocation_reason === "key_compromise")) continue;
    if (t < Date.parse(b.valid_from) || t > Date.parse(b.valid_until)) continue;
    return { ok: true, binding_id: b.binding_id, evidence_method: b.evidence.method };
  }
  return { ok: false, reason: cands.some((b) => b.status === "revoked") ? "key_binding_revoked" : "key_binding_not_valid_at_time" };
}
// Receiver-side webhook checks: signature with the host key, 300-second window, no repeats.
export function checkWebhook(body, jwks, { seen = new Set(), now = Date.now(), maxSkewSeconds = 300 } = {}) {
  const v = verifyObject(body, jwks);
  if (!v.ok) return { ok: false, reason: v.reason };
  if (Math.abs(now - Date.parse(body.sent_at)) > maxSkewSeconds * 1000) return { ok: false, reason: "stale_or_future_timestamp" };
  if (seen.has(body.webhook_id)) return { ok: false, reason: "replayed_webhook_id" };
  if (body.event?.handoff_id !== body.handoff_id) return { ok: false, reason: "handoff_mismatch" };
  seen.add(body.webhook_id);
  return { ok: true };
}
