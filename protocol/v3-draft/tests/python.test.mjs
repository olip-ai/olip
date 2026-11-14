// The independent Python client: it reproduces the committed test vectors (canonical JSON, journal chain, capsule digest,
// signatures, sealed capsule, plan digest) and drives a live host. The vectors file must equal the generator output.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildVectors } from "../scripts/make-vectors.mjs";
import { planNextActions } from "../reference/planner.mjs";
import { startSystem, people } from "./helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const py = (args) => spawnSync("python3", ["-I", ...args], { cwd: root, encoding: "utf8" });
// The live check must not block this process: the host under test runs in it.
const pyAsync = (args) => new Promise((resolve) => { const p = spawn("python3", ["-I", ...args], { cwd: root }); let stdout = "", stderr = ""; p.stdout.on("data", (d) => (stdout += d)); p.stderr.on("data", (d) => (stderr += d)); p.on("close", (status) => resolve({ status, stdout, stderr })); });
const hasCryptography = spawnSync("python3", ["-I", "-c", "import cryptography"]).status === 0;
let sys, who;
before(async () => { sys = await startSystem(); who = await people(sys); });
after(() => sys.stop());

test("committed vectors equal the generator output (reproducible from public labels)", () => {
  assert.equal(readFileSync(join(root, "vectors", "v3-vectors.json"), "utf8"), JSON.stringify(buildVectors(), null, 2) + "\n");
  const v = buildVectors();
  assert.match(v.statement, /FICTIONAL/);
  const { plan_digest, ...plan } = v.plan;
  assert.equal(typeof plan_digest, "string"); assert.equal(plan.not_authorization, true);
  assert.deepEqual(planNextActions({ workflow_id: "wf_vector", head: { sequence: 3, digest: v.journal[2].event_digest }, principal_kind: "agent", goal: "share_casebrief",
    lifecycle: { matter: { state: "open" }, conflict_screens: [{ id: "scr_vector", organization_id: "org_test_alvarez", state: "eligible_for_further_intake" }], consultations: [], engagements: [] },
    disclosures: [], grantState: () => "missing", writeGate: () => null, policy_version: "vectors#1" }), v.plan, "the planner reproduces the vector plan byte for byte");
});
test("the Python client reproduces every vector, independently of the JavaScript reference", () => {
  const r = py(["sdk/python/check_vectors.py"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout.trim().split("\n").at(-1));
  assert.equal(out.failed, 0, JSON.stringify(out));
  assert.equal(out.checked, hasCryptography ? 9 : 8);
  assert.equal(out.skipped, hasCryptography ? 0 : 1);
});
test("the Python client drives a live host: verifies the manifest and journal, and cannot send without the user's approval", async () => {
  const r = await pyAsync(["sdk/python/journey_check.py", sys.base, who.alpha.token]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const out = JSON.parse(r.stdout.trim().split("\n").at(-1));
  assert.equal(out.ok, true, JSON.stringify(out.details));
  assert.ok(out.steps.length >= 7);
});
