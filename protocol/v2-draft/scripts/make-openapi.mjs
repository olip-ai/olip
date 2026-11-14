// Generates openapi/olip-v2-draft.json (OpenAPI 3.1) from the reference host's own route table, so the published
// API description cannot drift from the code. Response bodies point at the JSON Schemas in ../schemas/.
// Run: node scripts/make-openapi.mjs   (tests/openapi.test.mjs fails if the committed file differs from this output)
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createLifecycleHost, createClock } from "../reference/lifecycle-host.mjs";
import { RESPONSE_MAP } from "../conformance/schema-check.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ref = (name) => ({ $ref: name.includes("#") ? `../schemas/${name}` : `../schemas/${name}.schema.json` });
const o = (properties, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, required, properties });
const s = (extra = {}) => ({ type: "string", ...extra });
// Names the user's approval. Clients may send back the approval object they were given, unchanged; only grant_id and grant_digest are used.
const grantRef = { ...o({ grant_id: s(), grant_digest: s({ pattern: "^sha256:[0-9a-f]{64}$" }), approval_id: s(), approval_url: s(), expires_at: s(), state: s(), instructions: s() }, ["grant_id", "grant_digest"]),
  description: "The approval the user gave on the approval page. The host checks it is active, unused, unexpired and bound to exactly this content." };
const firmEvent = o({ event: ref("lifecycle-event") });
const fields = { type: "array", items: s({ pattern: "^[a-z_]+(\\.[a-z_]+)*$" }), minItems: 1 };

// Request bodies, read from what each handler accepts. Firm writes are always one signed LifecycleEvent.
export const REQUESTS = {
  token: { oneOf: [o({ grant_type: { const: "client_credentials" }, client_id: s(), client_secret: s() }), o({ grant_type: { const: "urn:olip:params:oauth:grant-type:delegation_code" }, client_id: s(), client_secret: s(), code: s() })] },
  create_user_session: o({ subject_id: s(), password: s({ description: "Mock only. A real host uses its own OpenID Connect sign-in." }) }),
  create_agent_delegation: o({ client_id: s(), content_access: { type: "boolean", default: false } }, ["client_id"]),
  create_matter: { oneOf: [o({ casebrief: { type: "object" }, fictional: { type: "boolean" }, reopens: s() }, ["casebrief"]), o({ from_passport: ref("matter-passport"), passport_issuer_keys: { type: "array" }, fictional: { type: "boolean" } }, ["from_passport"])] },
  update_casebrief: o({ casebrief: { type: "object" } }),
  request_conflict_screen: o({ organization_id: s(), fields, selection: o({ by: { const: "user", description: "The user picked this recipient. Agent-chosen recipients are refused." } }) }),
  submit_conflict_screen: grantRef, provide_additional_screening: o({ fields }), submit_additional_screening: grantRef,
  request_casebrief_disclosure: o({ organization_id: s(), fields }), submit_casebrief_disclosure: grantRef,
  decide_approval: o({ decision: { enum: ["approve", "decline"] }, otp: s({ description: "The one-time code sent to the user's own contact." }), grant_digest: s() }, ["decision", "grant_digest"]),
  request_consultation: o({ organization_id: s(), preferences: o({ modes: { type: "array", items: { enum: ["video", "phone", "in_person", "unknown"] } }, timezone: s(), note: s() }, []) }, ["organization_id"]),
  submit_consultation_request: grantRef, propose_consultation_slot: o({ slot_id: s() }), submit_consultation_proposal: grantRef,
  record_consultation_event: { oneOf: [firmEvent, o({ event_type: { enum: ["consultation.cancelled", "consultation.reschedule_requested"] } })] },
  publish_engagement_offer: firmEvent, record_engagement_event: firmEvent, respond_to_engagement_offer: o({ offer_digest: s() }, []),
  record_conflict_screen_event: firmEvent, record_message_event: firmEvent, record_thread_event: firmEvent,
  record_matter_event: { oneOf: [firmEvent, o({ event_type: { const: "matter.closed", description: "A user closing their own unrepresented intake journey." } })] },
  create_thread: o({ organization_id: s(), purpose: { enum: ["pre_engagement", "consultation", "engaged", "post_closure"] } }, ["organization_id"]),
  send_message: { oneOf: [firmEvent, o({ body: s({ minLength: 1 }), category: { enum: ["substantive"] }, attachments: { type: "array", items: s() } }, ["body"]), o({ category: { const: "logistics" }, template: s() })] },
  send_authorized_message: grantRef,
  preauthorize_logistics: o({ templates: { type: "array", items: s(), minItems: 1 }, max_uses: { type: "integer", minimum: 1, maximum: 5 }, hours: { type: "integer", minimum: 1, maximum: 72 } }, ["templates"]),
  prepare_document_upload: o({ matter_id: s(), filename: s(), declared_mime: { enum: ["application/pdf", "image/png", "text/plain"] }, size: { type: "integer", minimum: 1 }, purpose: s() }, ["matter_id", "filename", "declared_mime", "size"]),
  upload_document: o({ content_base64: s({ contentEncoding: "base64" }) }),
  transfer_approved_document: { ...o({ ...grantRef.properties, document_id: s() }, ["document_id"]), description: "First call with document_id only returns an approval link; second call adds the approval the user gave." },
  export_matter_passport: o({ include_documents: { type: "boolean", default: false } }, []),
  subscribe_lifecycle_events: o({ callback_url: s({ format: "uri", description: "HTTPS only; private, loopback and link-local addresses are refused, and DNS is re-checked." }), event_types: { type: "array", items: s() } }, ["callback_url"]),
};
const NO_IDEM = new Set(["token", "create_user_session", "decide_approval"]);

export function buildOpenApi() {
  const host = createLifecycleHost({ mode: "mock", topology: "relay", clock: createClock(), firms: [] });
  const paths = {};
  for (const r of host.routes) {
    const params = r.keys.map((k) => ({ name: k, in: "path", required: true, schema: { type: "string" } }));
    if (r.mutating && r.method !== "GET" && !NO_IDEM.has(r.opId)) params.push({ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", minLength: 1, maxLength: 200 }, description: "Same key and same body returns the first result; same key with a different body is 409 OLIP_IDEMPOTENCY_CONFLICT." });
    if (r.opId === "update_casebrief") params.push({ name: "If-Match", in: "header", required: true, schema: { type: "string" }, description: "The current CaseBrief revision. Missing is 428 OLIP_REVISION_REQUIRED; stale is 409 OLIP_REVISION_CONFLICT." });
    if (r.opId === "upload_document") params.push({ name: "x-olip-upload-token", in: "header", required: true, schema: { type: "string" } });
    if (r.opId === "get_messages") params.push({ name: "cursor", in: "query", schema: { type: "string" } }, { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100 } });
    if (r.opId === "list_recipients") params.push({ name: "jurisdiction", in: "query", schema: { type: "string" } }, { name: "matter", in: "query", schema: { type: "string" } });
    if (r.opId === "get_intake_questions") params.push({ name: "stage", in: "query", schema: { enum: ["screening", "casebrief"] } });
    const src = r.run.toString();
    const code = /,\s*201\)/.test(src) ? "201" : "200";
    const map = RESPONSE_MAP[r.opId] || {};
    let body;
    if (map["."]) body = ref(map["."]);
    else body = { type: "object", required: r.opId === "token" ? ["access_token", "token_type", "expires_in"] : ["olip_version"], properties: { ...(r.opId === "token" ? {} : { olip_version: { const: "2.0-draft" } }),
      ...Object.fromEntries(Object.entries(map).map(([k, v]) => k.endsWith("[]") ? [k.slice(0, -2), { type: "array", items: ref(v) }] : [k, ref(v)])) } };
    const responses = { [code]: { description: "Success.", content: { "application/json": { schema: body } } } };
    if (/,\s*202\)/.test(src)) responses["202"] = { description: "Accepted by a relay; the organization's system has not confirmed receipt. Not delivery.", content: { "application/json": { schema: { type: "object" } } } };
    if (r.opId === "get_approval") responses["200"].content["text/html"] = { schema: { type: "string" } };
    if (r.opId === "download_document") responses["200"] = { description: "The document bytes.", content: { "application/octet-stream": { schema: { type: "string", contentMediaType: "application/octet-stream" } } } };
    responses.default = r.opId === "token"
      ? { description: "OAuth 2.0 error (RFC 6749 section 5.2).", content: { "application/json": { schema: { type: "object", required: ["error"], properties: { error: { type: "string" }, error_description: { type: "string" } } } } } }
      : { description: "An OLIP error. See error.code.", content: { "application/json": { schema: ref("error") } } };
    const op = { operationId: r.opId, summary: r.summary, tags: [tagOf(r.path)], "x-olip-callers": r.auth, parameters: params.length ? params : undefined,
      security: r.auth.includes("public") ? [] : [{ bearer: [] }], responses };
    if (REQUESTS[r.opId]) op.requestBody = { required: true, content: { "application/json": { schema: REQUESTS[r.opId] } } };
    if (r.opId === "decide_approval") op.requestBody.content["application/x-www-form-urlencoded"] = { schema: REQUESTS.decide_approval };
    if (r.opId === "decide_approval") op["x-olip-model-callable"] = false;
    (paths[r.path] ||= {})[r.method.toLowerCase()] = JSON.parse(JSON.stringify(op));
  }
  return {
    openapi: "3.1.0", jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: { title: "OLIP 2.0-draft lifecycle API", version: "2.0.0-draft.1", license: { name: "Apache-2.0", identifier: "Apache-2.0" },
      description: "PROPOSED draft. Not adopted by any standards body and not approved by any bar or regulator. OLIP 1.0 is unchanged and frozen. This file is generated from the reference host's route table. Mock-only test hooks (/mock/v2/*) are deliberately left out: a real host must never expose them." },
    servers: [{ url: "http://127.0.0.1:{port}", description: "Local reference host (fictional data only).", variables: { port: { default: "8787" } } }],
    tags: [...new Set(host.routes.map((r) => tagOf(r.path)))].map((name) => ({ name })),
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Tokens identify one caller kind: user (session), agent (delegated by one user), firm (organization client credentials) or observer. x-olip-callers on each operation lists who may call it." } } },
    paths,
  };
}
function tagOf(p) {
  if (/capabilit|well-known|keys|token|sessions|delegation/.test(p)) return "discovery-and-auth";
  if (/conflict|disclosure|recipients|intake/.test(p)) return "intake";
  if (/approval|grant/.test(p)) return "consent";
  if (/consultation/.test(p)) return "consultation";
  if (/engagement/.test(p)) return "engagement";
  if (/thread|message/.test(p)) return "communications";
  if (/document|upload|download/.test(p)) return "documents";
  return "matter";
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(join(root, "openapi"), { recursive: true });
  const doc = buildOpenApi();
  writeFileSync(join(root, "openapi", "olip-v2-draft.json"), JSON.stringify(doc, null, 2) + "\n");
  console.log(`Wrote openapi/olip-v2-draft.json with ${Object.values(doc.paths).reduce((n, p) => n + Object.keys(p).length, 0)} operations.`);
}
