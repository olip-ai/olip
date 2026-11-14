// OLIP 3.0-draft JSON Schemas (draft 2020-12), defined once here. scripts/make-schemas.mjs writes them to schemas/,
// the host serves them at /olip/v3/schemas/, and the tests check that every live response matches. PROPOSED, NOT ADOPTED.
import { SCHEMA_BASE, V3 } from "./lib/core.mjs";
import { ERROR_CODES } from "./lib/errors.mjs";
import { EFFECTS, ACTIONS, inputSchemaId } from "./actions.mjs";
import { DISPOSITIONS } from "./planner.mjs";

const $id = (n) => `${SCHEMA_BASE}${n}.schema.json`;
const ref = (n, frag = "") => ({ $ref: `${$id(n)}${frag}` });
const obj = (properties, required = [], additional = false) => ({ type: "object", properties, required, additionalProperties: additional });
const digest = { type: "string", pattern: "^sha256:[0-9a-f]{64}$" };
const dt = { type: "string", format: "date-time" };
const nstr = { type: ["string", "null"] };
const v3 = { const: V3 };
const signature = obj({ alg: { const: "EdDSA" }, kid: { type: "string" }, value: { type: "string", pattern: "^[A-Za-z0-9_-]+$" } }, ["alg", "kid", "value"]);
const common = { olip_version: v3, correlation_id: nstr, action_receipt: obj({ action: { type: "string" }, effect: { enum: EFFECTS }, decision: { type: "string" }, policy_version: { type: "string" }, note: { type: "string" } }, ["action", "effect", "decision", "policy_version", "note"]), idempotent_replay: { type: "boolean" } };
const top = (name, title, properties, required = []) => ({ $schema: "https://json-schema.org/draft/2020-12/schema", $id: $id(name), title, description: `OLIP ${V3} (proposed draft, not adopted).`,
  ...obj({ ...common, ...properties }, ["olip_version", ...required]) });

export const ORIGIN_TYPES = ["user_reported", "document_extracted", "official_source_checked", "firm_asserted", "third_party_asserted", "ai_interpretation"];
export const STATUS_SEMANTICS = [
  { state: "tool_call_succeeded", layer: "MCP / A2A / HTTPS", means: "The host ran the action.", does_not_mean: "Any organization received, read or accepted anything." },
  { state: "a2a_task_completed", layer: "A2A", means: "The agent-level task ended.", does_not_mean: "A consultation was held or representation began." },
  { state: "accepted_by_transport", layer: "2.0-draft delivery", means: "A relay accepted the item.", does_not_mean: "The firm's system confirmed receiving it." },
  { state: "delivered_to_endpoint", layer: "2.0-draft delivery", means: "The firm's endpoint returned a signed receipt for this exact content.", does_not_mean: "Anyone read it, responded, or took the matter." },
  { state: "eligible_for_further_intake", layer: "2.0-draft intake", means: "The firm says intake may continue.", does_not_mean: "A conflict clearance finding or representation." },
  { state: "consultation_confirmed", layer: "2.0-draft consultation", means: "The firm confirmed an appointment time.", does_not_mean: "The consultation happened or legal advice was given." },
  { state: "engagement_offer_issued", layer: "2.0-draft engagement", means: "The firm signed a versioned offer.", does_not_mean: "The client accepted or representation began." },
  { state: "client_accepted_offer", layer: "2.0-draft engagement", means: "The user's acceptance of one exact offer version was recorded.", does_not_mean: "The firm confirmed the engagement." },
  { state: "firm_confirmed", layer: "2.0-draft engagement", means: "The firm's authorized attorney signed a confirmation. Shown as 'Firm reports engagement confirmed'.", does_not_mean: "A legal determination that an attorney-client relationship exists." },
  { state: "matter_closed", layer: "2.0-draft matter", means: "The firm (or, for an unrepresented intake, the user) closed the matter.", does_not_mean: "All obligations, records or legal holds have ended." },
  { state: "capsule_imported", layer: "3.0-draft continuity", means: "One assistant may read one user-authorized capsule.", does_not_mean: "Permission to contact or send anything to any organization." },
  { state: "planner_allowed", layer: "3.0-draft planner", means: "Current state suggests the step is available.", does_not_mean: "Permission. The gateway checks again when the step is called." },
];

const assertion = obj({ claim_id: { type: "string" }, field_path: { type: "string" }, value: {}, origin_type: { enum: ORIGIN_TYPES }, source_ref: { type: "string" }, observed_at: dt, verified_at: { anyOf: [dt, { type: "null" }] },
  jurisdiction: nstr, extraction_method: { type: "string" }, confidence_or_uncertainty: { type: "string" }, verification_status: { enum: ["unverified", "not_verified", "signature_verified_by_2_0_host", "verified_under_named_procedure"] },
  supersedes_claim_id: nstr, access_classification: { enum: ["client_confidential", "public"] }, content_digest: digest, untrusted_text_flags: { type: "array", items: { type: "string" } }, note: nstr },
["claim_id", "field_path", "value", "origin_type", "source_ref", "observed_at", "verified_at", "verification_status", "access_classification", "content_digest"]);
const capsuleContent = obj({ assertions: { type: "array", items: assertion }, conflicts: { type: "array", items: obj({ field_path: { type: "string" }, claim_ids: { type: "array", items: { type: "string" } }, resolution: { enum: ["unresolved", "resolved_by_user"] }, statement: { type: "string" } }, ["field_path", "claim_ids", "resolution"]) },
  unresolved_questions: { type: "array", items: obj({ question_id: { type: "string" }, text: { type: "string" }, origin_type: { enum: ORIGIN_TYPES } }, ["question_id", "text", "origin_type"]) },
  time_sensitive_fields: { type: "array", items: obj({ field_path: { type: "string" }, description: nstr, value: nstr, timezone: nstr, origin_type: { enum: ORIGIN_TYPES }, verification_status: { enum: ["unverified", "verified_under_named_procedure"] }, calculation: { type: "null" }, statement: { type: "string" } }, ["field_path", "value", "origin_type", "verification_status", "calculation"]) },
  document_refs: { type: "array", items: obj({ document_id: { type: "string" }, sha256: digest, mime: { type: "string" }, access_scope: { type: "string" }, content_included: { const: false } }, ["document_id", "sha256", "access_scope", "content_included"]) } },
["assertions", "conflicts", "unresolved_questions", "time_sensitive_fields", "document_refs"]);
const sealed = obj({ alg: { const: "ECDH-ES+HKDF-SHA256/A256GCM" }, recipient_kid: { type: "string" }, epk: obj({ kty: { const: "OKP" }, crv: { const: "X25519" }, x: { type: "string" } }, ["kty", "crv", "x"]), iv: { type: "string" }, tag: { type: "string" }, aad: { type: "string" }, ciphertext: { type: "string" } }, ["alg", "recipient_kid", "epk", "iv", "tag", "aad", "ciphertext"]);
const capsule = { $schema: "https://json-schema.org/draft/2020-12/schema", $id: $id("context-capsule"), title: "Legal Context Capsule",
  description: "A user-controlled, signed, selective export of legal task context. Not a transcript, not assistant memory, not a privilege guarantee, and not authorization to contact any recipient.",
  ...obj({ olip_version: v3, document: { const: "legal_context_capsule" }, capsule_version: v3, capsule_id: { type: "string", pattern: "^cap_" }, matter_ref: { type: "string" }, subject_ref: { type: "string", pattern: "^subj_" },
    controller: { type: "object" }, issuer: { type: "string" }, fictional: { type: "boolean" }, created_at: dt, expires_at: dt,
    source_provenance: obj({ origin: { type: "string" }, method: { const: "user_initiated_export" }, casebrief_revision: { type: "integer" }, as_of_event_sequence: { type: "integer" }, as_of_event_digest: digest }, ["origin", "method", "as_of_event_sequence", "as_of_event_digest"]),
    included_fields: { type: "array", items: { type: "string" } }, excluded_fields: { type: "array", items: obj({ path: { type: "string" }, reason: { type: "string" } }, ["path", "reason"]) },
    workflow_snapshot: obj({ as_of: dt, as_of_event_sequence: { type: "integer" }, as_of_event_digest: digest, lifecycle: { type: "object" }, pending_user_approvals: { type: "integer" }, authoritative_sources: { type: "object" } }, ["as_of", "as_of_event_sequence", "lifecycle"]),
    export_authorization: obj({ authorized_by: { const: "signed_in_user_session" }, purpose: { enum: ["continue_with_another_assistant", "personal_record"] }, originating_system: { type: "string" }, expires_at: dt, onward_disclosure: { const: false }, authorizes_recipients: { type: "array", maxItems: 0 }, new_host_access: { type: "string" }, statement: { type: "string" } },
      ["authorized_by", "purpose", "onward_disclosure", "authorizes_recipients"]),
    intended_host: { anyOf: [obj({ client_id: { type: "string" } }, ["client_id"]), { type: "null" }] },
    retention: obj({ expires_at: dt, revocation: { type: "string" }, deletion: { type: "string" }, legal_hold_caveat: { type: "string" } }, ["expires_at", "revocation", "legal_hold_caveat"]),
    excludes: { type: "array", items: { type: "string" } }, schema_ref: { type: "string" },
    encryption: obj({ status: { enum: ["none", "recipient_key"] }, alg: { type: "string" }, recipient_kid: { type: "string" }, content_digest: digest, statement: { type: "string" } }, ["status", "statement"]),
    content: capsuleContent, sealed_content: sealed, capsule_digest: digest, signature },
  ["olip_version", "document", "capsule_version", "capsule_id", "matter_ref", "subject_ref", "issuer", "created_at", "expires_at", "source_provenance", "included_fields", "excluded_fields", "workflow_snapshot", "export_authorization", "retention", "encryption", "capsule_digest", "signature"]),
  oneOf: [{ required: ["content"], not: { required: ["sealed_content"] } }, { required: ["sealed_content"], not: { required: ["content"] } }],
  $defs: { content: capsuleContent, assertion } };

const event = { $schema: "https://json-schema.org/draft/2020-12/schema", $id: $id("workflow-event"), title: "Workflow event envelope", description: "Signed, hash-chained entry in the 3.0-draft workflow journal. Holds references, never case content.",
  ...obj({ olip_version: v3, event_id: { type: "string" }, workflow_id: { type: "string" }, sequence: { type: "integer", minimum: 1 }, event_type: { type: "string", pattern: "^[a-z_]+(\\.[a-z_]+)+$" }, schema_version: v3, recorded_at: dt,
    actor_type: { enum: ["user", "ai_host", "firm_authorized_actor", "lifecycle_host", "operator"] }, actor_ref: { type: ["object", "null"] }, authority_ref: nstr, source: { enum: ["olip_3_layer", "olip_2_0_draft_lifecycle"] },
    v2_ref: { anyOf: [obj({ seq: { type: "integer" }, entry_hash: digest, event_id: { type: "string" }, signer_kid: nstr, attribution_at_mirror: { type: "string" }, object: { type: "object" } }, ["seq", "entry_hash", "event_id"]), { type: "null" }] },
    payload_digest: digest, payload: { type: "object" }, previous_event_digest: digest, policy_version: { type: "string" }, idempotency_key: nstr, privacy_scope: { const: "participant_minimum" }, fictional: { type: "boolean" }, event_digest: digest, signature },
  ["olip_version", "event_id", "workflow_id", "sequence", "event_type", "recorded_at", "actor_type", "source", "payload_digest", "previous_event_digest", "policy_version", "event_digest", "signature"]) };

const contract = obj({ id: { type: "string", pattern: "^olip\\.[a-z_]+$" }, version: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, effects: { type: "array", items: { enum: EFFECTS }, minItems: 1 }, effect: { enum: EFFECTS }, effect_meaning: { type: "string" },
  principals: { type: "array", items: { enum: ["public", "user", "agent", "firm", "operator"] } }, approval: { enum: ["none", "user_out_of_band", "user_session"] }, firm_authority: { type: "boolean" }, mutating: { type: "boolean" },
  idempotency: { enum: ["required", "not_applicable"] }, retry: { enum: ["safe", "safe_with_same_key", "never"] }, max_execution_ms: { type: "integer" }, response: { enum: ["immediate", "receipt"] }, preconditions: { type: "array", items: { type: "string" } },
  transports: { type: "array", items: { enum: ["https", "mcp", "a2a"] } }, input_schema: { type: "string" }, output_schema: { type: "string" }, enforcement_note: { type: "string" } },
["id", "version", "effects", "effect", "principals", "approval", "firm_authority", "mutating", "idempotency", "retry", "transports", "input_schema", "output_schema"]);
const jwk = { type: "object", required: ["kty", "kid"] };

const list = [
  { $schema: "https://json-schema.org/draft/2020-12/schema", $id: $id("action-contract"), title: "Action contract", ...contract },
  top("agent-manifest", "Agent manifest", { manifest_version: v3, release_status: { const: "proposed_draft_not_adopted" }, statement: { type: "string" }, provider_id: { type: "string" }, issuer: { type: "string" }, endpoint_origin: { type: "string" },
    supported_olip_versions: { type: "array", items: { type: "string" } }, extension_id: { type: "string" }, profile: { type: "string" }, profiles: { type: "array" }, transport_bindings: { type: "object" }, actions: { type: "array", items: ref("action-contract") },
    effects: { type: "object" }, policy: { type: "object" }, status_semantics: { type: "array" }, approval: obj({ user_approval_methods: { type: "array" }, approval_is_model_callable: { const: false } }, ["approval_is_model_callable"]),
    neutrality: obj({ discovery_ordering: { type: "string" }, paid_influence: { const: false }, sponsor_services_required: { const: false }, sponsor_account_required: { const: false } }, ["paid_influence", "sponsor_services_required", "sponsor_account_required"]),
    privacy: { type: "object" }, keys_url: { type: "string" }, errors_url: { type: "string" }, schemas_base: { type: "string" }, mode: { enum: ["mock", "production"] }, fictional_data_only: { type: "boolean" }, max_age_seconds: { type: "integer" }, expires_at: dt, etag: digest, signature },
  ["manifest_version", "release_status", "provider_id", "supported_olip_versions", "actions", "policy", "neutrality", "approval", "etag", "expires_at", "signature"]),
  top("error", "Error", { error: obj({ code: { enum: ERROR_CODES }, message: { type: "string" }, retryable: { type: "boolean" }, details: { type: "object" } }, ["code", "message", "retryable"]) }, ["error"]),
  top("professionals", "Organizations", { ordering: obj({ method: { type: "string" }, paid_influence: { const: false } }, ["method", "paid_influence"]), professionals: { type: "array" }, statement: { type: "string" } }, ["ordering", "professionals"]),
  top("recipient-policy", "Recipient intake policy", { organization_id: { type: "string" }, stage: { type: "string" }, fields: { type: "array" }, statement: nstr, lifecycle_profiles: { type: "array" } }, ["organization_id", "fields"]),
  top("casebrief-check", "CaseBrief check", { casebrief_digest: digest, field_paths: { type: "array" }, missing_for_screening: { type: "array" }, sensitive_findings: { type: "object" }, instruction_like_text: { type: "object" }, transmitted: { const: false }, stored: { const: false }, statement: { type: "string" } }, ["casebrief_digest", "transmitted", "stored"]),
  top("workflow", "Workflow", { workflow: { type: "object", required: ["workflow_id", "head", "lifecycle"] }, status_semantics: { type: "array" }, statement: { type: "string" } }, ["workflow"]),
  event,
  top("events-page", "Workflow events page", { workflow_id: { type: "string" }, entries: { type: "array", items: ref("workflow-event") }, next_cursor: { type: "string" }, has_more: { type: "boolean" }, head: { type: "object" }, chain: { type: "object" }, keys_url: { type: "string" } }, ["workflow_id", "entries", "next_cursor", "has_more", "chain"]),
  top("disclosure-preview", "Prepared disclosure", { disclosure: { type: "object", required: ["disclosure_id", "organization_id", "stage", "fields", "state", "approval"] }, sent: { const: false }, next: { type: "string" }, statement: { type: "string" } }, ["disclosure", "sent"]),
  top("disclosure-result", "Disclosure result", { disclosure: { type: "object" }, delivery: { type: "object" }, lifecycle_object: { type: ["object", "null"] }, status_semantics: { type: "object" }, statement: { type: "string" } }, ["disclosure"]),
  top("next-actions-plan", "Next actions plan", { plan_version: v3, workflow_id: { type: "string" }, as_of_event_sequence: { type: "integer" }, as_of_event_digest: digest, desired_goal: nstr,
    next_actions: { type: "array", items: obj({ action: { type: "string" }, operation: { type: "string" }, target: { type: "object" }, disposition: { enum: DISPOSITIONS }, reason_code: { type: "string", pattern: "^[A-Z_]+$" }, missing_preconditions: { type: "array", items: { type: "string" } } }, ["action", "disposition", "reason_code", "missing_preconditions"]) },
    policy_version: { type: "string" }, not_authorization: { const: true }, not_legal_advice: { const: true }, statement: { type: "string" }, plan_digest: digest },
  ["plan_version", "workflow_id", "as_of_event_sequence", "next_actions", "policy_version", "not_authorization", "not_legal_advice", "plan_digest"]),
  capsule,
  top("context-capsule-export", "Capsule export result", { capsule: ref("context-capsule"), transmitted: { const: false }, statement: { type: "string" } }, ["capsule", "transmitted"]),
  top("capsule-check", "Capsule check", { ok: { type: "boolean" }, problems: { type: "array", items: { type: "string" } }, issuer_kid: nstr, encrypted: { type: "boolean" }, stored: { const: false } }, ["ok", "problems"]),
  top("import-authorization", "Capsule import authorization", { import_authorization: obj({ olip_version: v3, import_authorization_id: { type: "string" }, capsule_id: { type: "string" }, capsule_digest: digest, client_id: { type: "string" }, subject_ref: { type: "string" },
    authorized_by: { const: "signed_in_user_session" }, created_at: dt, expires_at: dt, nonce: { type: "string" }, max_uses: { const: 1 }, scope: { type: "array" }, authorizes_recipients: { type: "array", maxItems: 0 }, statement: { type: "string" }, signature }, ["import_authorization_id", "capsule_id", "capsule_digest", "client_id", "expires_at", "authorizes_recipients", "signature"]) }, ["import_authorization"]),
  top("capsule-import", "Imported capsule", { import: { type: "object" }, capsule: ref("context-capsule"), grants_created: { const: 0 }, authorizes_recipients: { type: "array", maxItems: 0 }, statement: { type: "string" } }, ["import", "capsule", "grants_created", "authorizes_recipients"]),
  top("capsule-revocation", "Capsule revocation", { capsule_id: { type: "string" }, revoked: { const: true }, revoked_at: dt, statement: { type: "string" } }, ["capsule_id", "revoked"]),
  top("subscription", "Subscription", { subscription: { type: "object", required: ["subscription_id", "workflow_id", "active", "verification"] } }, ["subscription"]),
  { $schema: "https://json-schema.org/draft/2020-12/schema", $id: $id("webhook"), title: "Webhook hint", description: "Signed, minimal, content-free hint. Receivers verify the signature, check sent_at skew and deduplicate on webhook_id.",
    ...obj({ olip_version: v3, webhook_id: { type: "string" }, subscription_id: { type: "string" }, workflow_id: { type: "string" }, event_sequence: { type: "integer" }, event_type: { type: "string" }, event_digest: digest, sent_at: dt, statement: { type: "string" }, signature },
    ["olip_version", "webhook_id", "subscription_id", "workflow_id", "event_sequence", "event_type", "event_digest", "sent_at", "signature"]) },
  top("lifecycle-result", "Lifecycle step result", { operation: { type: "string" }, lifecycle_v2_route: { type: "string" }, result: { type: ["object", "null"] }, effect: { enum: EFFECTS }, next: { type: "string" }, statement: { type: "string" } }, ["operation", "lifecycle_v2_route", "result", "effect"]),
  top("policy-change", "Policy change", { jurisdiction: { type: "string" }, rule: { type: "object" }, policy_version: { type: "string" } }, ["jurisdiction", "rule", "policy_version"]),
  top("decision", "Policy decision", { decision: { enum: ["allow", "require_user_approval", "require_firm_authority", "deny", "unknown_policy"] }, reason_code: { type: "string" }, missing: { type: "array", items: { type: "string" } }, policy_version: { type: "string" }, detail: { type: "object" } }, ["decision", "reason_code", "missing", "policy_version"]),
  top("keys", "Host keys", { keys: { type: "array", items: jwk } }, ["keys"]),
];
export const SCHEMAS = Object.fromEntries(list.map((s) => [s.$id.slice(SCHEMA_BASE.length).replace(/\.schema\.json$/, ""), s]));
// Output schema per action.
export const OUTPUT_SCHEMA = Object.fromEntries(ACTIONS.map((a) => [a.id, SCHEMAS[a.output].$id]));
// Input schemas, published under actions/.
export const INPUT_SCHEMAS = Object.fromEntries(ACTIONS.map((a) => [a.id, { $schema: "https://json-schema.org/draft/2020-12/schema", $id: inputSchemaId(a), title: `${a.title} (input)`, ...a.input }]));
