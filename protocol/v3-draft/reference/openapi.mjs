// Builds the OLIP 3.0-draft OpenAPI 3.1 document from the route table, the action catalog and the schemas.
// scripts/make-openapi.mjs writes it to openapi/olip-v3-draft.json; tests fail if the committed copy drifts.
import { V3 } from "./lib/core.mjs";
import { ERRORS } from "./lib/errors.mjs";
import { ACTION_BY_ID, ACTIONS, EFFECT_MEANING } from "./actions.mjs";
import { SCHEMAS, INPUT_SCHEMAS, OUTPUT_SCHEMA } from "./schemas.mjs";
import { ROUTES } from "./routes.mjs";

export function buildOpenApi() {
  const paths = {};
  const opIds = new Set();
  for (const r of ROUTES) {
    const a = r.actionId ? ACTION_BY_ID[r.actionId] : null;
    const oas = r.path.replace(/\{([^}]+)\}/g, "{$1}");
    const params = r.keys.map((k) => ({ name: k, in: "path", required: true, schema: { type: "string" } }));
    if (a && r.method === "GET") for (const [k, v] of Object.entries(a.input.properties || {})) if (!r.keys.includes(k)) params.push({ name: k, in: "query", required: false, schema: v.type === "integer" ? { type: "integer" } : { type: "string" } });
    let opId = (a ? a.id.replace(/^olip\./, "") : "invoke_action") + (r.path === "/.well-known/olip-agent.json" ? "_well_known" : "");
    while (opIds.has(opId)) opId += "_alt"; opIds.add(opId);
    const op = {
      operationId: opId, summary: a ? a.title : "Invoke any action by id",
      description: a ? `${a.summary}\n\nEffect: ${a.effect} (${EFFECT_MEANING[a.effect]}) Principals: ${a.principals.join(", ")}. Approval: ${a.approval}.` : "Generic invocation. The body is the action's input. Same gateway, same rules.",
      tags: [a ? a.effect : "invoke"], parameters: [...params, ...(a?.mutating || !a ? [{ name: "Idempotency-Key", in: "header", required: !!a?.mutating, schema: { type: "string", minLength: 8, maxLength: 128 } }] : []),
        { name: "OLIP-Version", in: "header", required: false, schema: { const: V3 } }, { name: "X-Correlation-Id", in: "header", required: false, schema: { type: "string" } }],
      ...(a && !a.principals.includes("public") ? { security: [{ bearer: [] }] } : a ? { security: [] } : { security: [{ bearer: [] }, {}] }),
      responses: { 200: { description: "Success. A tool or HTTP success is not delivery, reading, acceptance or representation.", content: { "application/json": { schema: { $ref: a ? OUTPUT_SCHEMA[a.id] : SCHEMAS["agent-manifest"].$id } } } },
        default: { description: "Error with a stable code.", content: { "application/json": { schema: { $ref: SCHEMAS.error.$id } } } } },
      "x-olip-action": a ? a.id : "{action_id}", "x-olip-effect": a ? a.effect : "per action",
    };
    if (["POST", "DELETE"].includes(r.method) && a && Object.keys(a.input.properties || {}).length && r.keys.length === 0) op.requestBody = { required: true, content: { "application/json": { schema: { $ref: INPUT_SCHEMAS[a.id].$id } } } };
    if (!a) op.requestBody = { required: false, content: { "application/json": { schema: { type: "object" } } } };
    (paths[oas] ||= {})[r.method.toLowerCase()] = op;
  }
  const extra = { "/olip/v3/actions": "List action contracts", "/olip/v3/keys": "Host public keys (JWKS)", "/olip/v3/errors": "Error catalog", "/olip/v3/openapi.json": "This document" };
  for (const [p, s] of Object.entries(extra)) paths[p] = { get: { operationId: "get_" + p.split("/").pop().replace(/\W/g, "_"), summary: s, security: [], responses: { 200: { description: s, content: { "application/json": { schema: { type: "object" } } } } } } };
  return {
    openapi: "3.1.0",
    jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
    info: { title: "OLIP 3.0-draft agent compatibility layer (PROPOSED, not adopted)", version: V3,
      description: "Proposed draft. Not a stable release, not adopted by any standards body, not independently security reviewed, not approved by any bar or regulator. Fictional data only. Every path here is a design candidate served by the reference host, not a published production endpoint.",
      license: { name: "Apache-2.0 (code); see the repository LICENSE.md for specification text", identifier: "Apache-2.0" } },
    servers: [{ url: "http://127.0.0.1", description: "Local fictional sandbox only" }],
    components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", description: "Tokens from the co-located 2.0 host (/olip/v2/token, /olip/v2/user-sessions). Mock credentials only." } },
      schemas: Object.fromEntries([...Object.entries(SCHEMAS), ...Object.entries(INPUT_SCHEMAS).map(([k, v]) => [`input.${k}`, v])].map(([k, v]) => [k.replace(/[^A-Za-z0-9._-]/g, "_"), v])) },
    paths, tags: Object.entries(EFFECT_MEANING).map(([name, description]) => ({ name, description })),
    "x-olip-errors": Object.values(ERRORS).map((e) => ({ code: e.code, http: e.http, retryable: e.retryable })), "x-olip-action-count": ACTIONS.length,
  };
}
