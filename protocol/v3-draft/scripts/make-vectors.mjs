// Builds vectors/v3-vectors.json: reproducible OLIP 3.0-draft test vectors (fictional keys, fixed inputs).
// Other implementations (sdk/python here) must reproduce digests and verify every signature and envelope.
// Run: node scripts/make-vectors.mjs   (tests fail if the committed file differs from this output)
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { V3, ZERO_DIGEST, signingKey, encryptionKey, signDetached, digestOf, canonicalize, sealToRecipient } from "../reference/lib/core.mjs";
import { planNextActions } from "../reference/planner.mjs";

export function buildVectors() {
  const k = signingKey("vectors/events", "workflow_events");
  const ck = signingKey("vectors/capsules", "capsule_issuer");
  const rk = encryptionKey("vectors/recipient");
  const eph = encryptionKey("vectors/ephemeral");
  // Journal: three chained, signed envelopes.
  const journal = []; let prev = ZERO_DIGEST;
  for (const [i, t] of ["workflow.created", "disclosure.prepared", "lifecycle.intake.eligible_for_further_intake"].entries()) {
    const env = { olip_version: V3, event_id: `urn:olip:v3:vectors:evt:wf_vector:${i + 1}`, workflow_id: "wf_vector", sequence: i + 1, event_type: t, schema_version: V3, recorded_at: `2026-11-14T15:0${i}:00.000Z`,
      actor_type: i === 2 ? "firm_authorized_actor" : "user", actor_ref: null, authority_ref: null, source: i === 2 ? "olip_2_0_draft_lifecycle" : "olip_3_layer", v2_ref: null, payload_digest: digestOf({ n: i }), payload: { n: i },
      previous_event_digest: prev, policy_version: "vectors#1", idempotency_key: null, privacy_scope: "participant_minimum", fictional: true };
    env.event_digest = digestOf(env); prev = env.event_digest;
    journal.push(signDetached(env, k));
  }
  // Capsule content, digest, signature and a sealed envelope with fixed ephemeral key and iv.
  const content = { assertions: [{ claim_id: "claim_001", field_path: "matter.category", value: "housing.landlord_tenant", origin_type: "user_reported", source_ref: "casebrief_revision_1", observed_at: "2026-11-14T15:00:00.000Z", verified_at: null,
    jurisdiction: "US-CA", extraction_method: "user_entered", confidence_or_uncertainty: "unknown", verification_status: "unverified", supersedes_claim_id: null, access_classification: "client_confidential", content_digest: digestOf("housing.landlord_tenant"), untrusted_text_flags: [] }],
    conflicts: [], unresolved_questions: [{ question_id: "q_001", text: "Was the notice formally served?", origin_type: "user_reported" }], time_sensitive_fields: [], document_refs: [] };
  const sealed = sealToRecipient(canonicalize(content), rk.publicJwk, "cap_vector|" + V3, { ephemeral: eph, iv: Buffer.alloc(12, 7) });
  const capsuleBody = { olip_version: V3, capsule_id: "cap_vector", encryption: { status: "recipient_key", content_digest: digestOf(content) }, sealed_content: sealed, expires_at: "2026-12-01T00:00:00.000Z" };
  capsuleBody.capsule_digest = digestOf(capsuleBody);
  const capsule = signDetached(capsuleBody, ck);
  // Webhook hint.
  const webhook = signDetached({ olip_version: V3, webhook_id: "whk_vector", subscription_id: "sub_vector", workflow_id: "wf_vector", event_sequence: 3, event_type: journal[2].event_type, event_digest: journal[2].event_digest, sent_at: "2026-11-14T15:03:00.000Z", statement: "Hint only." }, k);
  // Planner determinism: a fixed state and its exact plan.
  const plan = planNextActions({ workflow_id: "wf_vector", head: { sequence: 3, digest: prev }, principal_kind: "agent", goal: "share_casebrief",
    lifecycle: { matter: { state: "open" }, conflict_screens: [{ id: "scr_vector", organization_id: "org_test_alvarez", state: "eligible_for_further_intake" }], consultations: [], engagements: [] },
    disclosures: [], grantState: () => "missing", writeGate: () => null, policy_version: "vectors#1" });
  return { olip_version: V3, statement: "FICTIONAL test vectors. The private keys behind them are derivable from public labels and must never protect real data.",
    keys: { events: k.publicJwk, capsules: ck.publicJwk, recipient_public: rk.publicJwk, recipient_private_d: rk.privateKey.export({ format: "jwk" }).d },
    canonical: [{ input: { b: [3, { y: 1, x: "é" }], a: null }, canonical: canonicalize({ b: [3, { y: 1, x: "é" }], a: null }), digest: digestOf({ b: [3, { y: 1, x: "é" }], a: null }) }],
    journal, capsule, capsule_plaintext_digest: digestOf(content), webhook, plan };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "vectors", "v3-vectors.json"), JSON.stringify(buildVectors(), null, 2) + "\n");
  console.log("wrote vectors/v3-vectors.json");
}
