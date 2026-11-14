// The published JSON Schemas: generated output matches the committed files, every schema compiles under draft 2020-12 strict mode,
// fictional examples behave as labeled, the state machines validate, and the error-code registry matches the reference host.
// (Separately, tests/helpers.mjs validates EVERY live response in every other test file against these schemas.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { SCHEMAS, ERROR_CODE_LIST } from "../scripts/make-schemas.mjs";
import { loadSchemas, createResponseChecker, RESPONSE_MAP } from "../conformance/schema-check.mjs";
import { startSystem } from "../reference/system.mjs";
import { runScenarioA } from "../reference/journey.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const S = loadSchemas();

test("committed schemas equal the generator output (no hand edits, no drift from the state machines)", () => {
  const files = readdirSync(join(root, "schemas")).filter((f) => f.endsWith(".schema.json")).sort();
  assert.deepEqual(files, Object.keys(SCHEMAS).map((n) => `${n}.schema.json`).sort());
  for (const [n, s] of Object.entries(SCHEMAS)) assert.equal(readFileSync(join(root, "schemas", `${n}.schema.json`), "utf8"), JSON.stringify(s, null, 2) + "\n", n);
});
test("every schema compiles under JSON Schema 2020-12 strict mode and declares its $id", () => {
  for (const n of S.names) { const v = S.get(n); assert.ok(v, n); assert.equal(v.schema.$schema, "https://json-schema.org/draft/2020-12/schema"); assert.match(v.schema.$id, /^https:\/\/olip\.ai\/spec\/2\.0-draft\/schemas\//); }
});
test("fictional examples: each valid example passes and each invalid example fails its schema", () => {
  const idx = JSON.parse(readFileSync(join(root, "examples", "index.json"), "utf8"));
  assert.equal(idx.fictional, true);
  const covered = new Set();
  for (const e of idx.examples) {
    const v = S.get(e.schema); const data = JSON.parse(readFileSync(join(root, "examples", e.file), "utf8"));
    assert.equal(v(data), e.valid, `${e.file}: ${JSON.stringify(v.errors?.slice(0, 3))}`);
    if (e.valid) covered.add(e.schema);
  }
  for (const n of S.names.filter((x) => x !== "common")) assert.ok(covered.has(n), `no valid example for ${n}`);
  assert.ok(idx.examples.filter((e) => !e.valid).length >= 10);
});
test("all five state machines validate against the state-machine schema", () => {
  for (const m of ["intake", "consultation", "engagement", "message_delivery", "matter"]) {
    const v = S.get("state-machine"); const d = JSON.parse(readFileSync(join(root, "status-machines", `${m}.json`), "utf8"));
    assert.ok(v(d), `${m}: ${JSON.stringify(v.errors)}`);
  }
});
test("error-code registry matches exactly the codes the reference host and firm endpoint can return", () => {
  const src = ["reference/lifecycle-host.mjs", "reference/firm-endpoint.mjs"].map((f) => readFileSync(join(root, f), "utf8")).join("\n");
  const used = [...new Set([...src.matchAll(/"(OLIP_[A-Z_]+)"/g)].map((m) => m[1]))].sort();
  assert.deepEqual(used, [...ERROR_CODE_LIST].sort());
});
test("live responses from a full journey in both topologies match the schemas, and the check covers most operations", async () => {
  for (const topology of ["relay", "direct"]) {
    const chk = createResponseChecker(S);
    const sys = await startSystem({ topology, orgs: topology === "direct" ? ["org_test_alvarez"] : undefined, observe: chk.observe });
    const r = await runScenarioA(sys);
    for (const p of ["events", "grants", "reconciliations"]) await r.user.request("GET", `/olip/v2/matters/${r.matter_id}/${p}`);
    await r.user.request("GET", "/olip/v2/capabilities");
    await sys.stop();
    assert.deepEqual(chk.problems, [], topology);
    const mapped = Object.keys(RESPONSE_MAP).filter((k) => chk.seen.has(k));
    assert.ok(mapped.length >= 30, `${topology}: only ${mapped.length} mapped operations exercised`);
  }
});
test("the checker is not vacuous: a tampered live object is reported", () => {
  const chk = createResponseChecker(S);
  const ex = JSON.parse(readFileSync(join(root, "examples", "valid", "engagement.json"), "utf8"));
  chk.observe({ opId: "get_engagement", status: 200, body: { olip_version: "2.0-draft", engagement: { ...ex, state: "attorney_client_relationship_formed" } }, method: "GET", route: "/olip/v2/engagements/{id}" });
  chk.observe({ opId: null, status: 403, body: { error: { message: "no code" } }, method: "POST", route: "x" });
  assert.equal(chk.problems.length, 2);
});
