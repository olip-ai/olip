// Golden test vectors for independent OLIP 2.0-draft implementations: canonical JSON, digests, Ed25519 detached
// signatures with deterministic FICTIONAL keys, the disclosure-grant digest, the journal hash chain, zoned times and
// webhook checks. Everything is deterministic, so any language can rebuild and check it.
// Run: node scripts/make-vectors.mjs   (tests/vectors.test.mjs fails if the committed file differs)
import { writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { canonicalize } from "../../reference/lib/olip-core.mjs";
import { keyFromLabel, signDetached, verifyDetached, digestOf, grantDigest, checkZonedTime } from "../reference/lib/core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export function buildVectors() {
  const canon = [
    { name: "key order and no whitespace", input: { b: 1, a: [true, false, null], c: { z: "x", y: -7 } } },
    { name: "unicode text is kept, not escaped", input: { name: "Zoë Ñúñez (fictional)", note: "日本語 ✓" } },
    { name: "control characters and quotes are escaped as JSON.stringify does", input: { s: "line1\nline2\t\"quoted\" \\ \u0001" } },
    { name: "keys sort by UTF-16 code units (astral key after BMP private-use key)", input: { "ﬁ": 1, "\u{1F600}": 2, a: 3 } },
    { name: "nested arrays of objects", input: { list: [{ k: 2, j: 1 }, { k: [] }, {}] } },
    { name: "integers only (no floats in signed or digested content)", input: { n: 0, big: 9007199254740991, neg: -1 } },
  ].map((v) => ({ ...v, canonical: canonicalize(v.input), sha256: digestOf(v.input) }));

  const labels = ["vectors/firm-events", "vectors/host"];
  const keys = labels.map((l) => keyFromLabel(l, l.endsWith("host") ? "host_attestation" : "lifecycle_events"));
  const keyVectors = keys.map((k) => ({ label: k.label, seed_rule: "seed = SHA-256( UTF-8('olip-2.0-draft fictional test key: ' + label) ); Ed25519 private key = seed (RFC 8032)",
    seed_hex: createHash("sha256").update("olip-2.0-draft fictional test key: " + k.label).digest("hex"), public_jwk: k.publicJwk,
    kid_rule: "kid = 'kid_test_' + first 12 hex chars of SHA-256(UTF-8(label))", warning: "FICTIONAL test key. Its private half is public. Never trust it outside tests." }));

  const event = { olip_version: "2.0-draft", event_id: "urn:olip:org_test_vectors:event:v000000001", matter_id: "mat_vector000001", object: { type: "engagement", id: "eng_vector000001" }, event_type: "engagement.firm_confirmed",
    actor: { role: "firm", actor_id: "stf_test_vector_attorney", organization_id: "org_test_vectors", staff_role: "attorney" }, prior_revision: 2, occurred_at: "2026-11-14T17:00:00.000Z", idempotency_key: "idem-vector-1",
    correlation_id: "mat_vector000001", causation_id: null, evidence: { offer_digest: "sha256:" + "a".repeat(64), acceptance_id: "acc_vector000001" }, payload: {}, fictional: true };
  const signedEvent = signDetached(event, keys[0]);
  const tampered = { ...signedEvent, event_type: "engagement.firm_rejected" };
  const signatures = [
    { name: "firm-signed lifecycle event", signer_label: labels[0], object: signedEvent, signing_input: canonicalize(event), expect_valid: true },
    { name: "same signature after the event type was changed", signer_label: labels[0], object: tampered, expect_valid: verifyDetached(tampered, [keys[0].publicJwk]).ok },
    { name: "valid signature but kid not in the published key set", signer_label: labels[0], object: { ...signedEvent, signature: { ...signedEvent.signature, kid: "kid_test_unknown00000" } }, expect_valid: false, expect_reason: "unknown_kid" },
  ];

  const grant = { action: "disclosure.screening", subject_id: "usr_test_vector", matter_id: "mat_vector000001", recipient: { organization_id: "org_test_vectors", endpoint: "https://firm.example.test/firm/v2/inbox" },
    purpose: "conflict_screening", stage: "screening", fields: [{ path: "matter.jurisdiction", value: "US-CA" }, { path: "adverse_parties", value: ["Bayview Rentals LLC (fictional)"] }, { path: "prospective_client.name", value: "Casey Rivera (fictional)" }],
    documents: [], casebrief_revision: 1, related_object_id: "scr_vector000001", notice_version: "olip-2.0-draft-notices-1", nonce: "bm9uY2UtdmVjdG9yLTE", expires_at: "2026-11-14T17:30:00.000Z", use: "one_time", max_uses: 1 };
  const grantChanged = { ...grant, fields: grant.fields.map((f) => (f.path === "adverse_parties" ? { ...f, value: ["Bayview Rentals LLC (fictional)", "Another party (fictional)"] } : f)) };
  const grantVectors = [
    { name: "screening grant (fields are sorted by path before hashing)", grant, grant_digest: grantDigest(grant) },
    { name: "same grant with one more adverse party: a different digest, so the old approval no longer matches", grant: grantChanged, grant_digest: grantDigest(grantChanged) },
  ];
  const grantRule = "grant_digest = sha256(canonical({olip_version, action, subject_id, matter_id, recipient:{organization_id, endpoint}, purpose, stage|null, fields: sorted by path [{path,value}], documents: sorted by document_id [{document_id, sha256}], content_digest|null, casebrief_revision|null, related_object_id|null, offer_digest|null, notice_version, nonce, expires_at, use, max_uses, logistics_templates|null}))";

  const chain = []; let prev = "sha256:" + "0".repeat(64);
  for (const [i, et] of ["matter.created", "consent.granted", "intake.screening_requested"].entries()) {
    const ev = { event_id: `urn:olip:op_test_vectors:event:chain${i + 1}x`, event_type: et };
    const recorded_at = `2026-11-14T17:00:0${i}.000Z`;
    const entry_hash = digestOf({ seq: i + 1, recorded_at, prev_hash: prev, event: ev });
    chain.push({ seq: i + 1, recorded_at, prev_hash: prev, event: ev, entry_hash }); prev = entry_hash;
  }

  const zoned = [
    { start_utc: "2026-11-18T18:00:00Z", timezone: "America/Los_Angeles", local_start: "2026-11-18T10:00" },
    { start_utc: "2026-11-18T18:00:00Z", timezone: "America/New_York", local_start: "2026-11-18T13:00" },
    { start_utc: "2026-03-08T10:30:00Z", timezone: "America/Los_Angeles", local_start: "2026-03-08T03:30", note: "first hour after the spring-forward change" },
    { start_utc: "2026-11-01T08:30:00Z", timezone: "America/Los_Angeles", local_start: "2026-11-01T01:30", note: "ambiguous local hour on fall-back day; the UTC instant decides" },
    { start_utc: "2026-11-01T09:30:00Z", timezone: "America/Los_Angeles", local_start: "2026-11-01T01:30", note: "the same local wall time one hour later in UTC" },
    { start_utc: "2026-11-18T18:00:00Z", timezone: "America/Los_Angeles", local_start: "2026-11-18T18:00", note: "UTC shown as local" },
    { start_utc: "2026-11-18T10:00:00", timezone: "America/Los_Angeles", local_start: "2026-11-18T10:00", note: "missing Z" },
    { start_utc: "2026-11-18T18:00:00Z", timezone: "Pacific/Atlantis", local_start: "2026-11-18T10:00", note: "not an IANA zone" },
  ].map((z) => { const r = checkZonedTime(z); return { ...z, expect_ok: r.ok, ...(r.ok ? {} : { expect_reason: r.reason }) }; });

  const webhookBody = signDetached({ olip_version: "2.0-draft", webhook_id: "whk_vector000001", subscription_id: "sub_vector000001", sent_at: "2026-11-14T17:00:00.000Z", matter_id: "mat_vector000001",
    event_id: "urn:olip:op_test_vectors:event:chain3x", event_type: "intake.screening_requested", object: { type: "conflict_screen", id: "scr_vector000001" }, hint_only: true,
    statement: "A hint. Read the status of record before showing anything." }, keys[1]);
  const webhooks = { body: webhookBody, host_key_label: labels[1], max_skew_seconds: 300, cases: [
    { name: "fresh and first seen", now: "2026-11-14T17:02:00.000Z", seen: [], expect_ok: true },
    { name: "older than the allowed skew", now: "2026-11-14T17:06:00.000Z", seen: [], expect_ok: false, expect_reason: "stale_or_future_timestamp" },
    { name: "replayed webhook_id", now: "2026-11-14T17:01:00.000Z", seen: ["whk_vector000001"], expect_ok: false, expect_reason: "replayed_webhook_id" },
  ] };

  const offer = { offer_id: "offer-1", version: 1, terms_summary: "Fictional scope.", fee_summary: "Fictional flat fee.", valid_until: "2026-11-25T17:00:00.000Z", documents: [{ document_id: "doc_vector000001", sha256: "sha256:" + "b".repeat(64), title: "Engagement letter (fictional)" }] };
  const message = { body: "Fictional: here is my move-out checklist.", attachments: [] };
  return {
    olip_version: "2.0-draft", status: "proposed_draft_not_adopted", fictional: true,
    statement: "Golden vectors for the OLIP 2.0-draft lifecycle. All keys, people, firms and matters are fictional. The canonical JSON rules are OLIP 1.0's (spec section 9.1), unchanged.",
    canonical_json: canon, keys: keyVectors, signatures, grant_digest: { rule: grantRule, vectors: grantVectors }, journal_chain: { rule: "entry_hash = sha256(canonical({seq, recorded_at, prev_hash, event})); the first prev_hash is sha256: followed by 64 zeros", entries: chain },
    zoned_times: zoned, webhooks, offer_digest: { offer, offer_digest: digestOf(offer) }, message_content_digest: { content: message, content_digest: digestOf(message) },
  };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(join(root, "vectors"), { recursive: true });
  writeFileSync(join(root, "vectors", "golden-vectors.json"), JSON.stringify(buildVectors(), null, 2) + "\n");
  console.log("Wrote vectors/golden-vectors.json");
}
