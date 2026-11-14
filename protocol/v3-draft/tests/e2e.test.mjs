// The complete fictional journey (two assistants, one user, one firm), the demo script, the sandbox starter and the
// black-box conformance runner, end to end.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runConformance } from "../conformance/run.mjs";
import { startSystem, runJourney } from "./helpers.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const node = (args, { untilJson = false } = {}) => new Promise((resolve) => {
  const p = spawn(process.execPath, args, { cwd: root }); let out = "", err = "";
  p.stdout.on("data", (d) => { out += d; if (untilJson && out.includes("\n}")) p.kill("SIGTERM"); }); p.stderr.on("data", (d) => (err += d));
  p.on("close", (code) => resolve({ code, out, err }));
});

test("reference journey: all 12 steps pass and each safety property shows in the trace", async () => {
  const sys = await startSystem();
  try {
    const r = await runJourney(sys);
    assert.equal(r.trace.length, 12);
    const t = (n) => r.trace.find((x) => x.step === n).text;
    assert.match(t(3), /403 OLIP_AGENT_CANNOT_APPROVE/); assert.match(t(3), /USER_APPROVAL_REQUIRED/);
    assert.match(t(4), /replay=true/); assert.match(t(4), /IDEMPOTENCY_CONFLICT/); assert.match(t(4), /Deliveries on record: 1/);
    assert.match(t(7), /grants created: 0/); assert.match(t(7), /RECIPIENT_MISMATCH/); assert.match(t(7), /nothing delivered to the second firm/);
    assert.match(t(8), /dead_letter/); assert.match(t(8), /no gap/);
    assert.match(t(9), /CLIENT_ACCEPTANCE_IS_NOT_FIRM_CONFIRMATION/);
    assert.match(t(11), /MATTER_CLOSED/);
    assert.match(t(12), /verifies=true/); assert.match(t(12), /FIRM_AUTHORITY_REQUIRED/); assert.match(t(12), /ok=false/); assert.match(t(12), /NOT_FOUND/);
  } finally { await sys.stop(); }
});
test("the demo script runs and prints the 12 steps", async () => {
  const r = await node(["reference/demo.mjs"]);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /PROPOSED DRAFT, FICTIONAL DATA ONLY/);
  assert.match(r.out, /12\. Journal of \d+ events verifies=true/);
});
test("the sandbox starter prints a loopback address and a fictional agent token", async () => {
  const r = await node(["reference/start.mjs"], { untilJson: true });
  const out = JSON.parse(r.out.slice(0, r.out.indexOf("\n}") + 2));
  assert.match(out.base, /^http:\/\/127\.0\.0\.1:\d+$/); assert.ok(out.agent_token.length > 20); assert.match(out.statement, /FICTIONAL/);
});
test("the black-box conformance runner passes against a mock build and a production build, and says it is not certification", async () => {
  const { startV3System } = await import("../reference/system.mjs");
  for (const mode of ["mock", "production"]) {
    const sys = await startV3System({ mode });
    try {
      const r = await runConformance({ base: sys.base, label: `test-${mode}` });
      assert.equal(r.summary.fail, 0, JSON.stringify(r.results.filter((x) => x.status === "fail")));
      assert.equal(r.independent_implementation, false); assert.match(r.statement, /not certification/);
      assert.ok(r.summary.pass >= (mode === "mock" ? 17 : 8), JSON.stringify(r.summary));
    } finally { await sys.stop(); }
  }
});
