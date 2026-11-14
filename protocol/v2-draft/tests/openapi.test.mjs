// The OpenAPI 3.1 description: generated from the host's route table (no drift), complete, all references resolve,
// and every request body the reference clients actually send in a full journey matches its declared request schema.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildOpenApi, REQUESTS } from "../scripts/make-openapi.mjs";
import { loadSchemas, BASE } from "../conformance/schema-check.mjs";
import { startSystem } from "../reference/system.mjs";
import { runScenarioA } from "../reference/journey.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const committed = JSON.parse(readFileSync(join(root, "openapi", "olip-v2-draft.json"), "utf8"));
const absolutize = (x) => JSON.parse(JSON.stringify(x).replace(/"\.\.\/schemas\/([^"#]+)(#[^"]*)?"/g, (_, f, h) => JSON.stringify(BASE + f + (h || ""))));

test("committed OpenAPI file equals the generator output", () => {
  assert.equal(readFileSync(join(root, "openapi", "olip-v2-draft.json"), "utf8"), JSON.stringify(buildOpenApi(), null, 2) + "\n");
});
test("OpenAPI 3.1 shape: unique operationIds, every route present, no mock hooks, every mutating write requires Idempotency-Key", () => {
  assert.equal(committed.openapi, "3.1.0");
  const ops = Object.entries(committed.paths).flatMap(([p, v]) => Object.entries(v).map(([m, op]) => ({ p, m, op })));
  assert.equal(new Set(ops.map((x) => x.op.operationId)).size, ops.length);
  assert.ok(ops.length >= 55);
  assert.ok(!Object.keys(committed.paths).some((p) => p.startsWith("/mock")));
  for (const { p, m, op } of ops) {
    assert.ok(op.responses.default, `${m} ${p} default response`);
    if (m !== "get" && !["token", "create_user_session", "decide_approval", "get_lifecycle_capabilities"].includes(op.operationId) && op.parameters?.some((x) => x.name === "Idempotency-Key") === false) assert.fail(`${op.operationId}`);
  }
  const decide = committed.paths["/olip/v2/approvals/{id}/decision"].post;
  assert.deepEqual(decide["x-olip-callers"], ["user"]); assert.equal(decide["x-olip-model-callable"], false);
});
test("every $ref points at an existing schema file and JSON pointer", () => {
  const S = loadSchemas();
  const refs = [...JSON.stringify(committed).matchAll(/"\$ref":"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 50);
  for (const r of new Set(refs)) {
    const [file, frag] = r.split("#"); assert.ok(existsSync(join(root, "openapi", file)), r);
    assert.ok(S.ajv.getSchema(BASE + file.replace("../schemas/", "") + (frag ? "#" + frag : "")), r);
  }
});
test("every request body sent during a full fictional journey (both topologies) matches its declared request schema", async () => {
  const S = loadSchemas();
  const validators = Object.fromEntries(Object.entries(REQUESTS).map(([k, v]) => [k, S.ajv.compile({ $id: `urn:olip:test:req:${k}`, ...absolutize(v) })]));
  for (const topology of ["relay", "direct"]) {
    const bad = [], checked = new Set();
    const sys = await startSystem({ topology, orgs: topology === "direct" ? ["org_test_alvarez"] : undefined, observe: ({ opId, request, status }) => {
      if (!opId || request == null || !validators[opId] || status >= 400) return;
      checked.add(opId);
      if (!validators[opId](request)) bad.push({ opId, errors: validators[opId].errors.slice(0, 3) });
    } });
    await runScenarioA(sys);
    await sys.stop();
    assert.deepEqual(bad, [], topology);
    assert.ok(checked.size >= 20, `${topology}: ${checked.size} request shapes checked`);
  }
});
