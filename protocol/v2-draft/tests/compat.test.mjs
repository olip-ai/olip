// Backward compatibility with the frozen OLIP 1.0 release (Core wire 0.1 + Additions wire 0.2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { startSystem, actors } from "./helpers.mjs";
import { startCompatHost } from "../reference/compat-host.mjs";
import { createOlipServer } from "../../reference/server.mjs";
import { OlipLifecycleClient, OlipError } from "../sdk/typescript/dist/index.js";
import { MACHINES } from "../reference/lib/core.mjs";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const here = dirname(fileURLToPath(import.meta.url));
const PROTOCOL = join(here, "..", "..");
const MANIFEST = join(here, "..", "compat", "OLIP-1.0-SHA256SUMS.txt");
const run = (cmd, args, opts = {}) => new Promise((resolve) => { const p = spawn(cmd, args, { cwd: PROTOCOL, ...opts }); let out = "", err = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (err += d)); p.on("close", (code) => resolve({ code, out, err })); });
const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${s.address().port}`)));

test("the freeze list is the published one, and all 45 frozen OLIP 1.0 files are byte-for-byte unchanged", () => {
  const list = readFileSync(MANIFEST);
  assert.equal(createHash("sha256").update(list).digest("hex"), "b1e7339790ae0fc0a1f1029ec13f2a1137e89dec98ee9f1064bc3f6da6c7fb80", "published SHA-256 of the freeze list");
  const lines = list.toString("utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  assert.equal(lines.length, 45);
  for (const l of lines) { const [h, f] = l.split(/\s+/); assert.equal(createHash("sha256").update(readFileSync(join(PROTOCOL, f))).digest("hex"), h, f); }
});
test("no 2.0 file lives inside a frozen 1.0 folder, and 2.0 schema $ids use their own namespace", () => {
  for (const d of ["spec", "schemas", "schemas-0.2", "openapi", "examples", "examples-0.2"]) for (const f of readdirSync(join(PROTOCOL, d))) assert.ok(!/2\.0|v2/i.test(f), `${d}/${f}`);
  for (const f of readdirSync(join(here, "..", "schemas"))) { const s = JSON.parse(readFileSync(join(here, "..", "schemas", f), "utf8")); assert.ok(s.$id.startsWith("https://olip.ai/spec/2.0-draft/schemas/"), f); }
});
test("the 1.0 handoff state machine is untouched and shares no 2.0-only state", () => {
  const v1 = JSON.parse(readFileSync(join(PROTOCOL, "spec", "status-machine.json"), "utf8"));
  const v1States = new Set(Object.keys(v1.states));
  for (const s of ["firm_confirmed", "user_accepted", "read_by_recipient", "delivered_to_endpoint", "eligible_for_further_intake", "confirmed", "terminated"]) assert.ok(!v1States.has(s), `1.0 machine must not contain ${s}`);
  for (const m of Object.values(MACHINES)) assert.equal(m.olip_version, "2.0-draft");
});
test("the unchanged OLIP 1.0 conformance suite passes against the combined 1.0 + 2.0 host", async () => {
  const sys = await startSystem({ orgs: ["org_test_alvarez"] });
  const compat = await startCompatHost(sys);
  try {
    const r = await run("node", ["conformance/run.mjs", "--base", compat.base, "--label", "compat-host"]);
    assert.equal(r.code, 0, r.out + r.err);
    const m = r.out.match(/(\d+) pass, (\d+) fail, (\d+) skip/) || r.out.match(/pass[^\d]*(\d+)[^\d]+fail[^\d]*(\d+)[^\d]+skip[^\d]*(\d+)/i);
    assert.ok(m, r.out.slice(-400));
    assert.equal(Number(m[2]), 0, r.out.slice(-800)); assert.ok(Number(m[1]) >= 35, r.out.slice(-400));
    // 1.0 manifest still validates against the frozen 1.0 schema, and now advertises the lifecycle extension
    const man = await (await fetch(compat.base + "/.well-known/olip.json")).json();
    const ajv = new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv);
    for (const f of readdirSync(join(PROTOCOL, "schemas"))) ajv.addSchema(JSON.parse(readFileSync(join(PROTOCOL, "schemas", f), "utf8")));
    const validate = ajv.getSchema("https://olip.ai/spec/0.1/schemas/manifest.json");
    assert.equal(validate(man), true, JSON.stringify(validate.errors));
    assert.ok(man.extensions_supported.includes("olip.ai/lifecycle-capabilities/2.0-draft"));
    assert.ok(!("features_2_0" in man)); assert.deepEqual(man.supported_versions.filter((v) => v.startsWith("2")), []);
    // a 2.0 client sees the lifecycle profiles on the combined host
    const c = new OlipLifecycleClient(compat.base); const caps = await c.negotiate();
    assert.equal(caps.lifecycle, true); assert.equal(caps.profiles.length, 5); assert.ok(caps.olip1Versions.includes("0.1"));
  } finally { await compat.stop(); await sys.stop(); }
});
test("a 2.0 client against a 1.0-only endpoint (Node and Python) disables lifecycle features and never calls them", async () => {
  const v1 = createOlipServer({ mode: "mock" }); const base = await listen(v1.server);
  const py = spawn(process.platform === "win32" ? "python" : "python3", ["alt-python/olip_alt_server.py"], { cwd: PROTOCOL, env: { ...process.env, PORT: "18799" }, stdio: "ignore" });
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch("http://127.0.0.1:18799/.well-known/olip.json")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
    for (const b of [base, "http://127.0.0.1:18799"]) {
      let calls = 0; const counting = (u, o) => { calls++; return fetch(u, o); };
      const c = new OlipLifecycleClient(b, { fetch: counting });
      const caps = await c.negotiate();
      assert.equal(caps.lifecycle, false); assert.deepEqual(caps.profiles, []); assert.ok(caps.olip1Versions.includes("0.1"));
      const before = calls;
      await assert.rejects(c.createMatter({}), (e) => e instanceof OlipError && e.code === "OLIP_PROFILE_NOT_SUPPORTED");
      await assert.rejects(c.requestConsultation("m", "o", {}), (e) => e.code === "OLIP_PROFILE_NOT_SUPPORTED");
      assert.equal(calls, before, "no network call for an unsupported profile");
    }
  } finally { v1.server.close(); py.kill(); }
});
test("1.0 clients on the combined host still see only 1.0 states for 1.0 handoffs", async () => {
  const sys = await startSystem({ orgs: ["org_test_alvarez"] }); const compat = await startCompatHost(sys);
  try {
    const r = await run("node", ["reference/demo.mjs", compat.base]);
    assert.equal(r.code, 0, r.err); assert.match(r.out, /State: delivered/);
    assert.doesNotMatch(r.out, /firm_confirmed|delivered_to_endpoint|read_by_recipient/);
  } finally { await compat.stop(); await sys.stop(); }
});
