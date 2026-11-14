// The published contract: signed manifest, action catalog, JSON Schemas, OpenAPI 3.1 and error catalog.
// Committed files must equal the generator output (no hand edits), and the live host must serve the same documents.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { schemaFiles, errorCatalogMarkdown } from "../scripts/make-schemas.mjs";
import { buildOpenApi } from "../reference/openapi.mjs";
import { ACTIONS, ACTION_BY_ID, FORBIDDEN_NAME_PATTERNS, EFFECTS, LIFECYCLE_OPERATIONS } from "../reference/actions.mjs";
import { ROUTES } from "../reference/routes.mjs";
import { ERRORS, ERROR_CODES } from "../reference/lib/errors.mjs";
import { SCHEMAS } from "../reference/schemas.mjs";
import { verifyDetached } from "../sdk/typescript/dist/index.js";
import { startSystem, raw, people, responseCheck, CASEBRIEF } from "./helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let sys, who;
before(async () => { sys = await startSystem(); who = await people(sys); });
after(() => sys.stop());

test("committed schemas equal the generator output, compile in strict 2020-12 mode, and use the 3.0-draft namespace", () => {
  const files = schemaFiles();
  const onDisk = [...readdirSync(join(root, "schemas")).filter((f) => f.endsWith(".json")), ...readdirSync(join(root, "schemas", "actions")).map((f) => `actions/${f}`)].sort();
  assert.deepEqual(onDisk, Object.keys(files).sort());
  for (const [f, s] of Object.entries(files)) assert.equal(readFileSync(join(root, "schemas", f), "utf8"), JSON.stringify(s, null, 2) + "\n", f);
  for (const n of responseCheck.schemas.names) {
    const v = responseCheck.schemas.get(n); assert.ok(v, n);
    assert.equal(v.schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.match(v.schema.$id, /^https:\/\/olip\.ai\/spec\/3\.0-draft\/schemas\//);
  }
});
test("committed OpenAPI 3.1 document equals the generator output and covers every route and action", () => {
  const doc = buildOpenApi();
  assert.equal(readFileSync(join(root, "openapi", "olip-v3-draft.json"), "utf8"), JSON.stringify(doc, null, 2) + "\n");
  assert.equal(doc.openapi, "3.1.0");
  assert.match(doc.info.title, /PROPOSED/);
  const ops = Object.values(doc.paths).flatMap((p) => Object.values(p));
  assert.equal(new Set(ops.map((o) => o.operationId)).size, ops.length, "operationIds are unique");
  for (const a of ACTIONS) assert.ok(ops.some((o) => o["x-olip-action"] === a.id), `no route for ${a.id}`);
  for (const r of ROUTES) assert.ok(doc.paths[r.path]?.[r.method.toLowerCase()], `${r.method} ${r.path}`);
  for (const o of ops) for (const resp of Object.values(o.responses)) { const ref = resp.content?.["application/json"]?.schema?.$ref; if (ref) assert.ok(Object.values(SCHEMAS).some((s) => s.$id === ref), ref); }
  // Mutating actions require an Idempotency-Key in the contract.
  for (const o of ops.filter((x) => ACTION_BY_ID[x["x-olip-action"]]?.mutating)) assert.equal(o.parameters.find((p) => p.name === "Idempotency-Key")?.required, true, o.operationId);
});
test("action catalog: unique ids, strictest effect governs, no approval or firm-confirmation tool, user-only and firm actions are never MCP/A2A tools", () => {
  assert.equal(new Set(ACTIONS.map((a) => a.id)).size, ACTIONS.length);
  for (const a of ACTIONS) {
    assert.equal(a.effect, EFFECTS.find((e) => a.effects.includes(e)), a.id);
    assert.ok(!FORBIDDEN_NAME_PATTERNS.some((re) => re.test(a.id)), a.id);
    if (a.mutating) { assert.equal(a.idempotency, "required", a.id); assert.notEqual(a.retry, "safe", a.id); }
    if (["firm_authoritative", "privileged_admin"].includes(a.effect)) { assert.deepEqual(a.transports, ["https"], a.id); assert.ok(!a.principals.includes("agent"), a.id); }
    if (a.effect === "external_disclosure") assert.equal(a.approval, "user_out_of_band", a.id);
  }
  for (const id of ["olip.export_context_capsule", "olip.authorize_capsule_import", "olip.revoke_context_capsule"]) { assert.deepEqual(ACTION_BY_ID[id].principals, ["user"]); assert.deepEqual(ACTION_BY_ID[id].transports, ["https"]); }
  for (const op of Object.keys(LIFECYCLE_OPERATIONS)) assert.ok(!FORBIDDEN_NAME_PATTERNS.some((re) => re.test(op)), op);
  assert.ok(sys.v2.host.routes.some((r) => r.opId === "decide_approval"), "the 2.0 host has a user approval decision route...");
  assert.ok(!("decide_approval" in LIFECYCLE_OPERATIONS), "...which the 3.0 lifecycle bridge never exposes");
});
test("the manifest is signed by a published key, validates, names no sponsor dependency, and keeps its etag stable", async () => {
  const r = await raw(sys, "GET", "/.well-known/olip-agent.json");
  assert.equal(r.status, 200);
  const m = r.body;
  assert.equal(r.headers.etag, `"${m.etag}"`);
  const keys = (await raw(sys, "GET", "/olip/v3/keys")).body.keys;
  assert.deepEqual(await verifyDetached(m, keys), { ok: true });
  assert.ok(responseCheck.schemas.get("agent-manifest")(m), JSON.stringify(responseCheck.schemas.get("agent-manifest").errors));
  assert.equal(m.release_status, "proposed_draft_not_adopted");
  assert.match(m.statement, /not a stable release/i);
  assert.deepEqual(m.supported_olip_versions, ["2.0-draft", "3.0-draft.1"]);
  assert.equal(m.approval.approval_is_model_callable, false);
  assert.deepEqual([m.neutrality.paid_influence, m.neutrality.sponsor_services_required, m.neutrality.sponsor_account_required], [false, false, false]);
  assert.equal(m.actions.length, ACTIONS.length);
  assert.ok(!/esq|harness|copilot/i.test(JSON.stringify(m)), "no sponsor product named in the protocol manifest");
  const tampered = { ...m, actions: m.actions.slice(1) };
  assert.equal((await verifyDetached(tampered, keys)).ok, false);
  sys.clock.advance(60);
  const m2 = (await raw(sys, "GET", "/olip/v3/agent-manifest")).body;
  assert.equal(m2.etag, m.etag, "etag covers content only");
  assert.notEqual(m2.expires_at, m.expires_at);
});
test("served schemas, action contracts and the error catalog match the reference definitions", async () => {
  for (const [n, s] of Object.entries(SCHEMAS)) assert.deepEqual((await raw(sys, "GET", `/olip/v3/schemas/${n}.schema.json`)).body, s, n);
  const one = await raw(sys, "GET", "/olip/v3/schemas/actions/olip.submit_approved_disclosure.input.json");
  assert.equal(one.status, 200); assert.deepEqual(one.body.required, ["disclosure_id", "grant_id", "grant_digest"]);
  assert.equal((await raw(sys, "GET", "/olip/v3/schemas/nope.schema.json")).status, 404);
  const acts = (await raw(sys, "GET", "/olip/v3/actions")).body.actions;
  assert.deepEqual(acts.map((a) => a.id), ACTIONS.map((a) => a.id));
  for (const a of acts) assert.ok(responseCheck.schemas.get("action-contract")(a), a.id);
  const errs = (await raw(sys, "GET", "/olip/v3/errors")).body.errors;
  assert.deepEqual(errs.map((e) => e.code).sort(), [...ERROR_CODES].sort());
  for (const e of errs) { assert.ok(e.http >= 400 && e.http < 600, e.code); assert.equal(typeof e.retryable, "boolean"); assert.ok(e.meaning?.length > 10, e.code); }
  assert.deepEqual(SCHEMAS.error.properties.error.properties.code.enum, ERROR_CODES);
  assert.equal(readFileSync(join(root, "docs", "ERROR_CATALOG.md"), "utf8"), errorCatalogMarkdown(), "docs/ERROR_CATALOG.md is generated; regenerate it");
  assert.deepEqual((await raw(sys, "GET", "/olip/v3/openapi.json")).body, buildOpenApi());
});
test("protocol hygiene: unsupported version header, unknown route, unknown action, oversized and malformed bodies", async () => {
  const t = who.alpha.token;
  assert.equal((await raw(sys, "GET", "/olip/v3/agent-manifest", { headers: { "olip-version": "3.0" } })).body.error.code, "VERSION_UNSUPPORTED");
  assert.equal((await raw(sys, "GET", "/olip/v3/nothing-here")).body.error.code, "ACTION_NOT_SUPPORTED");
  assert.equal((await raw(sys, "POST", "/olip/v3/actions/olip.approve_disclosure/invoke", { token: t, body: {}, headers: { "idempotency-key": "k-00000001" } })).body.error.code, "ACTION_NOT_SUPPORTED");
  assert.equal((await raw(sys, "POST", "/olip/v3/casebriefs/check", { token: t, body: "{not json" })).body.error.code, "SCHEMA_INVALID");
  const big = await raw(sys, "POST", "/olip/v3/casebriefs/check", { token: t, body: JSON.stringify({ casebrief: { x: "a".repeat(1_100_000) } }) });
  assert.equal(big.status, 413);
  const extra = await raw(sys, "POST", "/olip/v3/casebriefs/check", { token: t, body: { casebrief: {}, approve: true } });
  assert.equal(extra.body.error.code, "SCHEMA_INVALID", "unknown input properties are refused, never interpreted");
  assert.equal((await raw(sys, "POST", "/olip/v3/workflows", { token: t, body: { casebrief: CASEBRIEF } })).body.error.code, "IDEMPOTENCY_KEY_REQUIRED");
  assert.equal((await raw(sys, "POST", "/olip/v3/workflows", { token: t, body: { casebrief: {} }, headers: { "idempotency-key": "k-nojuris-1" } })).body.error.code, "POLICY_UNREVIEWED", "a matter with no known jurisdiction fails closed");
  const sec = await raw(sys, "GET", "/olip/v3/keys");
  assert.equal(sec.headers["x-content-type-options"], "nosniff");
  const cor = await raw(sys, "GET", "/olip/v3/professionals", { headers: { "x-correlation-id": "trace-abc.1" } });
  assert.equal(cor.headers["x-correlation-id"], "trace-abc.1"); assert.equal(cor.body.correlation_id, "trace-abc.1");
  const badCor = await raw(sys, "GET", "/olip/v3/professionals", { headers: { "x-correlation-id": "bad value with spaces" } });
  assert.match(badCor.body.correlation_id, /^cor_/);
});
test("2.0-draft paths on the same origin pass through unchanged", async () => {
  const direct = await sys.v2.host.handle("GET", "/olip/v2/recipients?jurisdiction=US-CA", {}, null);
  const via = await raw(sys, "GET", "/olip/v2/recipients?jurisdiction=US-CA");
  assert.equal(via.status, direct.status);
  assert.deepEqual(via.body.recipients.map((x) => x.organization_id), direct.body.recipients.map((x) => x.organization_id));
  assert.equal((await raw(sys, "GET", "/.well-known/olip-lifecycle.json")).status, 200);
});
test("fictional examples: each valid example passes and each invalid example fails its schema; every response schema has an example", () => {
  const idx = JSON.parse(readFileSync(join(root, "examples", "index.json"), "utf8"));
  assert.equal(idx.fictional, true);
  const covered = new Set();
  for (const e of idx.examples) {
    const v = responseCheck.schemas.get(e.schema); const data = JSON.parse(readFileSync(join(root, "examples", e.file), "utf8"));
    assert.equal(v(data), e.valid, `${e.file}: ${JSON.stringify(v.errors?.slice(0, 3))}`);
    if (e.valid) covered.add(e.schema);
  }
  for (const a of ACTIONS) assert.ok(covered.has(a.output), `no valid example for ${a.output}`);
  assert.ok(idx.examples.filter((e) => !e.valid).length >= 12);
});
