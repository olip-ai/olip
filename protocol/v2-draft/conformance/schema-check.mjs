// Validates live OLIP 2.0-draft responses against the published JSON Schemas (draft 2020-12).
// Used by the tests (every response in every test) and by the conformance runner (against any host).
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "schemas");
export const BASE = "https://olip.ai/spec/2.0-draft/schemas/";
export function loadSchemas() {
  const ajv = new Ajv2020({ strict: true, allErrors: true, strictRequired: false, allowUnionTypes: true });
  addFormats(ajv);
  const names = readdirSync(dir).filter((f) => f.endsWith(".schema.json")).sort();
  for (const f of names) ajv.addSchema(JSON.parse(readFileSync(join(dir, f), "utf8")));
  const get = (name) => ajv.getSchema(name.startsWith("http") ? name : `${BASE}${name}.schema.json`) || ajv.getSchema(`${BASE}${name}`);
  return { ajv, names: names.map((f) => f.replace(/\.schema\.json$/, "")), get };
}

// Which member of each operation's response body is which schema. "x[]" means every item of array x; "." is the whole body.
export const RESPONSE_MAP = {
  get_lifecycle_capabilities: { ".": "capabilities" }, get_lifecycle_manifest: { ".": "capabilities" },
  create_matter: { matter: "legal-matter" }, get_matter: { matter: "legal-matter" }, update_casebrief: { matter: "legal-matter" }, record_matter_event: { matter: "legal-matter" },
  request_conflict_screen: { conflict_screen: "conflict-screen", approval: "common.schema.json#/$defs/approval_request" },
  get_conflict_screen: { conflict_screen: "conflict-screen" }, submit_conflict_screen: { conflict_screen: "conflict-screen", delivery: "common.schema.json#/$defs/delivery" },
  record_conflict_screen_event: { conflict_screen: "conflict-screen" }, withdraw_conflict_screen: { conflict_screen: "conflict-screen" },
  provide_additional_screening: { approval: "common.schema.json#/$defs/approval_request" }, submit_additional_screening: { conflict_screen: "conflict-screen", delivery: "common.schema.json#/$defs/delivery" },
  request_casebrief_disclosure: { approval: "common.schema.json#/$defs/approval_request" }, submit_casebrief_disclosure: { conflict_screen: "conflict-screen", delivery: "common.schema.json#/$defs/delivery" },
  get_approval: { approval: "approval" }, list_grants: { "grants[]": "disclosure-grant" },
  request_consultation: { consultation: "consultation", approval: "common.schema.json#/$defs/approval_request" }, submit_consultation_request: { consultation: "consultation" },
  get_consultation: { consultation: "consultation" }, record_consultation_event: { consultation: "consultation" },
  propose_consultation_slot: { approval: "common.schema.json#/$defs/approval_request" }, submit_consultation_proposal: { consultation: "consultation" },
  publish_engagement_offer: { engagement: "engagement" }, prepare_engagement_target: { engagement: "engagement" }, get_engagement: { engagement: "engagement" },
  respond_to_engagement_offer: { approval: "common.schema.json#/$defs/approval_request" }, record_engagement_event: { engagement: "engagement" },
  create_thread: { thread: "conversation-thread" }, get_thread: { thread: "conversation-thread" }, record_thread_event: { thread: "conversation-thread" },
  send_message: { message: "message" }, send_authorized_message: { message: "message" }, mark_message_read: { message: "message" }, record_message_event: { message: "message" }, get_messages: { "messages[]": "message" },
  upload_document: { document: "document-reference" }, export_matter_passport: { passport: "matter-passport" }, get_matter_events: { "entries[]": "audit-record" },
};

export function createResponseChecker(schemas = loadSchemas()) {
  const problems = [], seen = new Set();
  const check = (schemaRef, value, where) => {
    const v = schemaRef.includes("#") ? schemas.ajv.getSchema(BASE + schemaRef) : schemas.get(schemaRef);
    if (!v) { problems.push({ where, problem: `no schema ${schemaRef}` }); return; }
    if (!v(value)) problems.push({ where, schema: schemaRef, errors: v.errors.slice(0, 5).map((e) => `${e.instancePath || "/"} ${e.message} ${e.params ? JSON.stringify(e.params) : ""}`) });
  };
  function observe({ opId, status, body, html, raw, route, method }) {
    if (html || raw || body == null || typeof body !== "object") return;
    const where = `${method} ${route} ${status}`;
    if (status >= 400) { if (opId !== "token") check("error", body, where); return; } // the token endpoint uses the OAuth 2.0 error format (RFC 6749 section 5.2)
    if (!opId) return;
    seen.add(opId);
    if (body.olip_version !== undefined && body.olip_version !== "2.0-draft") problems.push({ where, problem: "olip_version" });
    for (const [k, schema] of Object.entries(RESPONSE_MAP[opId] || {})) {
      if (k === ".") { check(schema, body, where); continue; }
      const isArr = k.endsWith("[]"); const key = isArr ? k.slice(0, -2) : k;
      if (body[key] === undefined) continue;
      if (isArr) body[key].forEach((x, i) => check(schema, x, `${where} ${key}[${i}]`)); else check(schema, body[key], `${where} ${key}`);
    }
  }
  return { observe, problems, seen };
}
