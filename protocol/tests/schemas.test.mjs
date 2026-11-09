// Every example validates against its schema; the status machine is internally consistent; Ed25519 vector.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { makeValidator } from "../conformance/schema-validator.mjs";
import { STATUS_MACHINE as SM, canonicalize, consentDigest } from "../reference/lib/olip-core.mjs";
import { run, ROOT, PYTHON } from "./helpers.mjs";

test("every example file validates against the schema it names", async () => {
  const v = await makeValidator();
  const files = readdirSync(`${ROOT}/examples`).filter((f) => f.endsWith(".json"));
  assert.ok(files.length >= 10, "examples present");
  for (const f of files) {
    const ex = JSON.parse(readFileSync(`${ROOT}/examples/${f}`, "utf8"));
    const r = v(ex.schema, ex.example);
    assert.ok(r.ok, `${f}: ${r.errors}`);
    assert.equal(ex.fictional, true, `${f} must be marked fictional`);
  }
});
test("status machine: every transition uses known states, sources and has evidence; terminals have no exits", () => {
  for (const t of SM.transitions) {
    assert.ok(SM.states[t.from] && SM.states[t.to], JSON.stringify(t));
    assert.ok(t.sources.length && t.sources.every((s) => SM.sources[s]), JSON.stringify(t));
    assert.ok(t.evidence.length, JSON.stringify(t));
    assert.ok(!SM.states[t.from].terminal, `exit from terminal ${t.from}`);
  }
  for (const s of Object.keys(SM.states)) if (s !== "draft") assert.ok(SM.transitions.some((t) => t.to === s), `${s} unreachable`);
  assert.ok(!SM.transitions.some((t) => t.to === "delivered" && !t.evidence.includes("recipient_receipt")), "delivered always needs a receipt");
  assert.ok(!SM.transitions.some((t) => ["acknowledged", "responded", "consultation_confirmed", "completed"].includes(t.to) && t.sources.some((s) => ["client", "host", "transport", "user"].includes(s))), "only the recipient can claim recipient outcomes");
});
test("consent digest changes when any bound element changes", () => {
  const base = { recipient_id: "prf_a", casebrief_id: "cbr_1", casebrief_revision: 1, purpose: "request_initial_contact", mode: "consumer_selected_listing", shared_fields: [{ path: "summary", value: "x" }], notice_version: "n1" };
  const d0 = consentDigest(base);
  for (const [k, v] of [["recipient_id", "prf_b"], ["casebrief_revision", 2], ["purpose", "request_consultation"], ["mode", "direct_firm_intake"], ["shared_fields", [{ path: "summary", value: "y" }]], ["notice_version", "n2"]])
    assert.notEqual(consentDigest({ ...base, [k]: v }), d0, k);
  assert.equal(consentDigest({ ...base, shared_fields: [{ path: "b", value: 1 }, { path: "a", value: 2 }] }), consentDigest({ ...base, shared_fields: [{ path: "a", value: 2 }, { path: "b", value: 1 }] }), "field order does not matter");
  assert.equal(canonicalize({ b: 1, a: [true, null, "é"] }), '{"a":[true,null,"é"],"b":1}');
});
test("pure-Python Ed25519 matches RFC 8032 test vector 1", async () => {
  const r = await run(PYTHON, ["-c", "import sys; sys.path.insert(0,'alt-python'); import ed25519_pure as e; s=bytes.fromhex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60'); print(e.public_key(s).hex()); print(e.sign(s,b'').hex()); print(e.verify(e.public_key(s), b'', e.sign(s,b'')), e.verify(e.public_key(s), b'x', e.sign(s,b'')))"]);
  const [pub, sig, ver] = r.out.trim().split("\n");
  assert.equal(pub, "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
  assert.equal(sig, "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b");
  assert.equal(ver, "True False");
});
test("OpenAPI document covers every operation the reference manifest lists", async () => {
  const oa = JSON.parse(readFileSync(`${ROOT}/openapi/olip-0.1.json`, "utf8"));
  const ex = JSON.parse(readFileSync(`${ROOT}/examples/01-manifest.json`, "utf8")).example;
  for (const op of ex.operations) {
    const p = op.path.replace("{id}", "{id}");
    assert.ok(oa.paths[p] && oa.paths[p][op.method.toLowerCase()], `${op.method} ${op.path} missing from OpenAPI`);
  }
});
