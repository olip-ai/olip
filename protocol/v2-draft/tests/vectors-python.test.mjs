// Golden vectors (no drift) and the independent Python implementation: it must reproduce every vector, drive a real
// fictional journey against the reference host, and refuse lifecycle calls on an OLIP 1.0-only endpoint.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync, execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildVectors } from "../scripts/make-vectors.mjs";
import { startSystem } from "./helpers.mjs";
import { createOlipServer } from "../../reference/server.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// The host runs in this process, so live checks must not block the event loop (execFile, not spawnSync).
const pyAsync = (args) => new Promise((res) => execFile("python3", ["-I", ...args], { cwd: root, encoding: "utf8", timeout: 120000 }, (e, stdout, stderr) => res({ status: e ? (e.code ?? 1) : 0, stdout, stderr, json: (() => { try { return JSON.parse(stdout.trim().split("\n").pop()); } catch { return null; } })() })));
const py = (args) => { const r = spawnSync("python3", ["-I", ...args], { cwd: root, encoding: "utf8", timeout: 120000 }); return { ...r, json: (() => { try { return JSON.parse(r.stdout.trim().split("\n").pop()); } catch { return null; } })() }; };

test("committed golden vectors equal the generator output", () => {
  assert.equal(readFileSync(join(root, "vectors", "golden-vectors.json"), "utf8"), JSON.stringify(buildVectors(), null, 2) + "\n");
});
test("Python (standard library, separate code) reproduces every golden vector", () => {
  const r = py(["sdk/python/check_vectors.py"]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(r.json.failed, 0); assert.ok(r.json.checked >= 30);
});
test("Python client drives a fictional journey: agent cannot approve, nothing is sent before the user approves, receipts and journal verify", async () => {
  const sys = await startSystem();
  const r = await pyAsync(["sdk/python/journey_check.py", sys.hostBase]);
  await sys.stop();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json, { negotiated: true, agent_could_approve: false, agent_approve_error: "OLIP_AGENT_CANNOT_APPROVE", sent_before_user_approved: false, early_submit_error: "OLIP_DISCLOSURE_NOT_AUTHORIZED",
    preview_recipient: "org_test_cedar", preview_digest_matches: true, delivery_state: "delivered_to_endpoint", screen_state: "screening_requested", journal_ok: true, host_events_verify: true, passport_signature_ok: true, passport_transmitted: false });
});
test("Python client against an OLIP 1.0-only endpoint: lifecycle=false and lifecycle calls fail locally", async () => {
  const v1 = createOlipServer({ mode: "mock" });
  const base = await new Promise((r) => v1.server.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${v1.server.address().port}`)));
  const code = `import sys; sys.path.insert(0, "sdk/python"); import json, olip_lifecycle as o
c = o.LifecycleClient(sys.argv[1]); caps = c.negotiate()
try:
    c.recipients(); out = "called"
except o.OlipError as e:
    out = e.code
print(json.dumps({"lifecycle": caps["lifecycle"], "call": out, "v1": caps.get("olip1_versions")}))`;
  const r = await pyAsync(["-c", code, base]);
  await new Promise((res) => v1.server.close(res));
  const j = JSON.parse(r.stdout.trim());
  assert.equal(j.lifecycle, false); assert.equal(j.call, "OLIP_PROFILE_NOT_SUPPORTED"); assert.ok(j.v1.length >= 1);
});
test("the TypeScript client (WebCrypto) also reproduces the canonical JSON, digests, signatures and webhook vectors", async () => {
  const sdk = await import("../sdk/typescript/dist/index.js");
  const V = JSON.parse(readFileSync(join(root, "vectors", "golden-vectors.json"), "utf8"));
  for (const c of V.canonical_json) { assert.equal(sdk.canonicalize(c.input), c.canonical, c.name); assert.equal(await sdk.digestOf(c.input), c.sha256, c.name); }
  const keys = Object.fromEntries(V.keys.map((k) => [k.label, k.public_jwk]));
  for (const s of V.signatures) assert.equal((await sdk.verifyDetached(s.object, [keys[s.signer_label]])).ok, s.expect_valid, s.name);
  for (const c of V.webhooks.cases) assert.equal((await sdk.checkWebhook(V.webhooks.body, [keys[V.webhooks.host_key_label]], { seen: new Set(c.seen), now: Date.parse(c.now), maxSkewSeconds: V.webhooks.max_skew_seconds })).ok, c.expect_ok, c.name);
});
