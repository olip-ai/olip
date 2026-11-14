// OLIP 3.0-draft core helpers. PROPOSED, NOT ADOPTED. Node 20+, no third-party dependencies.
// Reuses the OLIP 1.0 canonical JSON and the 2.0-draft Ed25519 detached-signature rules unchanged (imported, never copied or edited).
import { createHash, createHmac, createPrivateKey, createPublicKey, generateKeyPairSync, diffieHellman, hkdfSync, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { canonicalize, sha256, signDetached, verifyDetached, digestOf, newId, safeEqual, sensitiveFindings, untrusted } from "../../../v2-draft/reference/lib/core.mjs";
import { checkCallbackUrl, isBlockedAddress } from "../../../v2-draft/reference/lib/ssrf.mjs";

export { canonicalize, sha256, signDetached, verifyDetached, digestOf, newId, safeEqual, sensitiveFindings, untrusted, checkCallbackUrl, isBlockedAddress };

// The only version identifier this folder uses on the wire. Never "3.0": nothing here is a stable release.
export const V3 = "3.0-draft.1";
export const V2_WIRE = "2.0-draft";
export const V3_EXTENSION = "olip.ai/agent-compatibility/3.0-draft";
export const PROFILE = "olip-agent-compat/3";
export const SCHEMA_BASE = "https://olip.ai/spec/3.0-draft/schemas/";
export const RELEASE_STATUS = "proposed_draft_not_adopted";
export const RELEASE_STATEMENT = "OLIP 3.0 is a proposed draft under development. It is not a stable release, has not been adopted by any standards body, has not been independently security reviewed, and has not been approved by any bar or regulator. OLIP 1.0 and the 2.0 draft are unchanged.";

// ---------- keys ----------
// Deterministic FICTIONAL keys, rebuilt from a public label so anyone can reproduce the test vectors.
// These private keys are public by design and must never sign anything outside tests.
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const PKCS8_X25519_PREFIX = Buffer.from("302e020100300506032b656e04220420", "hex");
const seedOf = (label) => createHash("sha256").update("olip-3.0-draft fictional test key: " + label).digest();
export function signingKey(label, purpose) {
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519_PREFIX, seedOf(label)]), format: "der", type: "pkcs8" });
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });
  const kid = "kid_v3test_" + createHash("sha256").update(label).digest("hex").slice(0, 12);
  return { kid, privateKey, label, publicJwk: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, kid, alg: "EdDSA", use: "sig", key_ops: ["verify"], olip_key_purpose: purpose } };
}
// X25519 key for receiving encrypted capsules. Fictional and deterministic, like the signing keys.
export function encryptionKey(label) {
  const privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_X25519_PREFIX, seedOf("x25519/" + label)]), format: "der", type: "pkcs8" });
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });
  const kid = "kid_v3enc_" + createHash("sha256").update(label).digest("hex").slice(0, 12);
  return { kid, privateKey, publicJwk: { kty: "OKP", crv: "X25519", x: jwk.x, kid, use: "enc", olip_key_purpose: "capsule_encryption" } };
}

// ---------- capsule envelope: X25519 ECDH + HKDF-SHA256 + AES-256-GCM ----------
// Encrypts to ONE recipient key. The sender's ephemeral key is discarded after use, so only the holder of the
// recipient's private key can open it. This is recipient-key encryption of a file; it is not a messaging protocol,
// it has no forward secrecy beyond the ephemeral sender key, and key distribution is the deployer's job.
// `fixed` (ephemeral private key and iv) exists ONLY to build reproducible test vectors. Never pass it otherwise.
export function sealToRecipient(plaintext, recipientPublicJwk, aad, fixed = null) {
  const eph = fixed ? { privateKey: fixed.ephemeral.privateKey, publicKey: createPublicKey(fixed.ephemeral.privateKey) } : generateKeyPairSync("x25519");
  const recipient = createPublicKey({ key: { kty: "OKP", crv: "X25519", x: recipientPublicJwk.x }, format: "jwk" });
  const shared = diffieHellman({ privateKey: eph.privateKey, publicKey: recipient });
  const ephX = eph.publicKey.export({ format: "jwk" }).x;
  const key = Buffer.from(hkdfSync("sha256", shared, Buffer.from(ephX + "." + recipientPublicJwk.x), Buffer.from("olip-3.0-draft capsule"), 32));
  const iv = fixed ? Buffer.from(fixed.iv) : randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv); c.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([c.update(Buffer.from(plaintext, "utf8")), c.final()]);
  return { alg: "ECDH-ES+HKDF-SHA256/A256GCM", recipient_kid: recipientPublicJwk.kid, epk: { kty: "OKP", crv: "X25519", x: ephX }, iv: iv.toString("base64url"), tag: c.getAuthTag().toString("base64url"), aad, ciphertext: ct.toString("base64url") };
}
export function openSealed(env, recipientKey) {
  const eph = createPublicKey({ key: env.epk, format: "jwk" });
  const shared = diffieHellman({ privateKey: recipientKey.privateKey, publicKey: eph });
  const key = Buffer.from(hkdfSync("sha256", shared, Buffer.from(env.epk.x + "." + recipientKey.publicJwk.x), Buffer.from("olip-3.0-draft capsule"), 32));
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(env.iv, "base64url")); d.setAAD(Buffer.from(env.aad)); d.setAuthTag(Buffer.from(env.tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(env.ciphertext, "base64url")), d.final()]).toString("utf8");
}

// ---------- small utilities ----------
export const hmac = (secret, s) => createHmac("sha256", secret).update(s).digest("base64url");
export const sameBytes = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
export const ZERO_DIGEST = "sha256:" + "0".repeat(64);
export const getPath = (o, p) => String(p).split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
export function setPath(o, p, v) { const ks = String(p).split("."); let x = o; for (const k of ks.slice(0, -1)) { if (x[k] == null || typeof x[k] !== "object") x[k] = {}; x = x[k]; } x[ks.at(-1)] = v; return o; }
export const FIELD_PATH = /^[a-z_]+(\.[a-z_]+)*$/;
// Leaf paths of a plain JSON object (arrays count as leaves).
export function leafPaths(o, prefix = "") {
  if (o == null || typeof o !== "object" || Array.isArray(o)) return prefix ? [prefix] : [];
  return Object.keys(o).flatMap((k) => leafPaths(o[k], prefix ? `${prefix}.${k}` : k));
}
// Text patterns that look like instructions aimed at an AI. They are flagged, never obeyed, never removed.
export const INJECTION_MARKERS = [/ignore (all|any|previous|prior) (instructions|rules)/i, /system (note|prompt|message) to (the )?ai/i, /\bapprove (this|the) disclosure\b/i, /send (it|this) to every/i, /you are now/i, /disregard (the )?(consent|approval)/i];
export const injectionFindings = (text) => INJECTION_MARKERS.filter((re) => re.test(String(text))).map((re) => re.source);
