// OLIP 0.2 additions: key bindings, signed status webhooks and intake cards on the Node reference endpoint,
// and the two new read-only MCP tools.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer, run } from "./helpers.mjs";
import { OlipClient, mockUserApproves } from "../reference/client.mjs";

let srv, FX, A;
test("start the Node endpoint", async () => {
  srv = await startServer("node", 18799);
  FX = await fetch(`${srv.base}/mock/fixtures`).then((r) => r.json());
  A = new OlipClient(srv.base, FX.clients.a); await A.login();
});
test("manifest lists 0.2 and its three features", async () => {
  const m = (await A.manifest()).body;
  assert.deepEqual(m.supported_versions, ["0.1", "0.2"]);
  assert.deepEqual(m.features_0_2.features, ["key_bindings", "status_webhooks", "intake_cards"]);
});
test("MCP adapter: intake card and receipt check tools work and stay read-only", async () => {
  const cb = (await A.createBrief({ fictional: true, client: { name: "Pat Example (fictional)", email: "pat.v02@example.test" }, location: { jurisdiction: "US-CA" }, matter: { code: "housing.landlord_tenant" }, summary: "Fictional test for 0.2." })).body.casebrief;
  const pv = (await A.preview({ casebrief_id: cb.id, recipient_id: FX.professionals.direct_ok, fields: ["summary", "client.name", "client.email", "location.jurisdiction", "matter.code"], mode: "consumer_selected_listing", purpose: "request_initial_contact", selection: { by: "user" } })).body.preview;
  const auth = (await mockUserApproves(srv.base, pv, cb.client.email)).body.authorization;
  const h = (await A.submit({ authorization_id: auth.authorization_id, consent_digest: auth.consent_digest })).body.handoff;
  const lines = [{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "olip_get_intake_card", arguments: { professional_id: FX.professionals.direct_ok } } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "olip_verify_receipt", arguments: { handoff_id: h.handoff_id } } }].map((x) => JSON.stringify(x)).join("\n") + "\n";
  const r = await run("node", ["reference/mcp-adapter.mjs"], { env: { ...process.env, OLIP_BASE: srv.base, OLIP_CLIENT_ID: FX.clients.a.client_id, OLIP_CLIENT_SECRET: FX.clients.a.client_secret }, input: lines });
  const out = r.out.trim().split("\n").map((l) => JSON.parse(l));
  const tools = out.find((l) => l.id === 2).result.tools;
  for (const n of ["olip_get_intake_card", "olip_verify_receipt"]) assert.equal(tools.find((t) => t.name === n)?.annotations?.readOnlyHint, true, n);
  assert.ok(!tools.some((t) => /approve(?!d)/.test(t.name)), "still no approve tool");
  const card = out.find((l) => l.id === 3).result.structuredContent;
  assert.equal(card.schema, "olip-intake-capability-card/0.2"); assert.match(card.firm_reported.label, /Not verified/);
  const v = out.find((l) => l.id === 4).result.structuredContent;
  assert.equal(v.signature_and_digest_ok, true); assert.equal(v.key_bound, true); assert.equal(v.evidence_method, "host_attestation");
});
test("0.1 clients are unaffected: a 0.1 version header still works and 0.3 is refused", async () => {
  assert.equal((await fetch(`${srv.base}/olip/v0.1/providers`, { headers: { "olip-version": "0.1" } })).status, 200);
  assert.equal((await fetch(`${srv.base}/olip/v0.1/providers`, { headers: { "olip-version": "0.3" } })).status, 400);
});
test("stop", () => srv.stop());
test("0.2 examples validate, and the ones marked as verifying do verify", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const { makeValidator } = await import("../conformance/schema-validator.mjs");
  const { verifyObject } = await import("../reference/lib/olip-core.mjs");
  const v = await makeValidator();
  const dir = new URL("../examples-0.2/", import.meta.url);
  const ex = Object.fromEntries(readdirSync(dir).map((f) => [f, JSON.parse(readFileSync(new URL(f, dir), "utf8"))]));
  for (const [f, e] of Object.entries(ex)) if (e.schema) assert.equal(v(e.schema, e.example).ok, true, f);
  const jwks = ex["20-keys.json"].example;
  for (const b of ex["21-key-bindings.json"].example.bindings) assert.equal(verifyObject(b, jwks).ok, true);
  assert.equal(verifyObject(ex["23-status-webhook.json"].example, jwks).ok, true);
});
