// The black-box conformance runner passes against the reference host in every configuration, and never labels it independent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { runConformance } from "../conformance/run.mjs";
import { startSystem } from "./helpers.mjs";
import { startCompatHost } from "../reference/compat-host.mjs";

test("relay and direct reference hosts: no failures; mock-only results are labeled; not independent", async () => {
  for (const topology of ["relay", "direct"]) {
    const sys = await startSystem({ topology, orgs: topology === "direct" ? ["org_test_alvarez"] : undefined });
    const r = await runConformance({ base: sys.hostBase, label: topology });
    await sys.stop();
    assert.equal(r.summary.fail, 0, JSON.stringify(r.results.filter((x) => x.status === "fail")));
    assert.equal(r.independent_implementation, false);
    assert.deepEqual(r.results.filter((x) => x.status === "mock_only").map((x) => x.id).sort(), ["B-05", "C-04"]);
  }
});
test("one address serving OLIP 1.0 and 2.0-draft passes, including the 1.0 manifest check", async () => {
  const sys = await startSystem(); const c = await startCompatHost(sys);
  const r = await runConformance({ base: c.base, label: "compat" });
  await c.stop(); await sys.stop();
  assert.equal(r.summary.fail, 0); assert.equal(r.results.find((x) => x.id === "C-03").status, "pass");
});
test("production build: no mock hooks (pass), and the policy gate fails closed so behavior checks are skipped, not faked", async () => {
  const sys = await startSystem({ mode: "production" });
  const r = await runConformance({ base: sys.hostBase, label: "prod" });
  await sys.stop();
  assert.equal(r.summary.fail, 0); assert.equal(r.results.find((x) => x.id === "C-04").status, "pass"); assert.equal(r.results.find((x) => x.id === "B-02").status, "skip");
});
