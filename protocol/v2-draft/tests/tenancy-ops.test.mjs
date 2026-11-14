// Tenant isolation, idempotency, concurrency, rate limits, log hygiene, the jurisdiction policy gate, journal integrity, webhooks and SSRF.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { startSystem, actors, userApproves, eligibleMatter, casebrief, SCREEN_FIELDS, expectErr, ok, obj, httpTransport, staff } from "./helpers.mjs";
import { checkCallbackUrl, isBlockedAddress } from "../reference/lib/ssrf.mjs";
import { checkWebhook } from "../sdk/typescript/dist/index.js";
let sys, a, b;
before(async () => { sys = await startSystem(); a = await actors(sys); b = await actors(sys, { subject: "usr_test_morgan" }); });
after(() => sys.stop());

test("cross-tenant guessing returns 404 for matters, screens, threads, messages, documents and exports", async () => {
  const { m, screen } = await eligibleMatter(sys, a);
  const t = ok(await a.ai.request("POST", `/olip/v2/matters/${m.matter_id}/threads`, { organization_id: "org_test_alvarez" })).thread;
  const d = await a.ai.draftMessage(t.id, "Fictional secret-ish text");
  for (const p of [`/olip/v2/matters/${m.matter_id}`, `/olip/v2/conflict-screens/${screen.id}`, `/olip/v2/threads/${t.id}`, `/olip/v2/threads/${t.id}/messages`, `/olip/v2/matters/${m.matter_id}/events`, `/olip/v2/matters/${m.matter_id}/grants`])
    expectErr(await (p.endsWith("/grants") ? b.user : b.ai).request("GET", p), 404, "OLIP_NOT_FOUND");
  expectErr(await b.ai.request("POST", `/olip/v2/messages/${d.message.id}/send`, d.approval), 404, "OLIP_NOT_FOUND");
  expectErr(await b.user.request("POST", `/olip/v2/matters/${m.matter_id}/exports`, {}), 404, "OLIP_NOT_FOUND");
  expectErr(await b.ai.request("GET", `/olip/v2/matters/mat_doesnotexist`), 404, "OLIP_NOT_FOUND");
  expectErr(await a.ai.request("GET", `/olip/v2/matters/${m.matter_id}`, undefined, { authorization: "Bearer nope" }), 401);
});
test("mutations require Idempotency-Key; retries replay; a different body with the same key is refused", async () => {
  const r = await fetch(sys.hostBase + "/olip/v2/matters", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${a.ai["token"]}` }, body: JSON.stringify({ casebrief: casebrief(), fictional: true }) });
  assert.equal(r.status, 400); assert.equal((await r.json()).error.code, "OLIP_IDEMPOTENCY_KEY_REQUIRED");
  const x = ok(await a.ai.request("POST", "/olip/v2/matters", { casebrief: casebrief(), fictional: true }, { "idempotency-key": "k1" }));
  const y = ok(await a.ai.request("POST", "/olip/v2/matters", { casebrief: casebrief(), fictional: true }, { "idempotency-key": "k1" }));
  assert.equal(x.matter.matter_id, y.matter.matter_id);
  expectErr(await a.ai.request("POST", "/olip/v2/matters", { casebrief: casebrief({ goals: "other" }), fictional: true }, { "idempotency-key": "k1" }), 409, "OLIP_IDEMPOTENCY_CONFLICT");
});
test("rate limits answer 429", async () => {
  const s2 = await startSystem({ orgs: ["org_test_alvarez"], rateLimitPerToken: 5 });
  try { const c = await actors(s2); let last; for (let i = 0; i < 8; i++) last = await c.ai.request("GET", "/olip/v2/matters/x"); expectErr(last, 429, "OLIP_RATE_LIMITED"); } finally { await s2.stop(); }
});
test("policy gate: production mode refuses every lifecycle write (no counsel-approved jurisdiction); unknown jurisdictions and non-fictional mock data fail closed", async () => {
  const prod = await startSystem({ orgs: ["org_test_alvarez"], mode: "production", hostLabel: "prod" });
  try {
    const c = await actors(prod);
    const r = expectErr(await c.ai.request("POST", "/olip/v2/matters", { casebrief: casebrief(), fictional: true }), 422, "OLIP_POLICY_GATE_CLOSED");
    assert.equal(r.error.details.rule_status, "pending_counsel_review");
    assert.equal(prod.host.capabilities().mock_hooks, undefined, "no mock hooks outside mock mode");
    assert.equal((await httpTransport(prod.hostBase).call("GET", "/mock/v2/outbox")).status, 404);
  } finally { await prod.stop(); }
  expectErr(await a.ai.request("POST", "/olip/v2/matters", { casebrief: casebrief({ matter: { category: "housing.landlord_tenant", jurisdiction: "US-ZZ" } }), fictional: true }), 422, "OLIP_POLICY_GATE_CLOSED");
  expectErr(await a.ai.request("POST", "/olip/v2/matters", { casebrief: casebrief(), fictional: false }), 422, "OLIP_POLICY_GATE_CLOSED");
});
test("logs keep only route templates, status and codes: no bodies, tokens, codes, names or message text", async () => {
  const { m } = await eligibleMatter(sys, a);
  const logs = JSON.stringify((await httpTransport(sys.hostBase).call("GET", "/mock/v2/logs")).body.lines);
  const outbox = (await httpTransport(sys.hostBase).call("GET", "/mock/v2/outbox")).body.messages;
  for (const bad of ["Casey Rivera", "Bayview", "deposit", a.ai["token"], outbox.at(-1).code, m.matter_id, "test-only"]) assert.ok(!logs.includes(bad), `log leaked ${bad}`);
  assert.match(logs, /\/olip\/v2\/matters\/\{id\}\/conflict-screens/);
});
test("CaseBriefs and message bodies are encrypted at rest in the host store", async () => {
  const m = (await a.ai.createMatter(casebrief(), { fictional: true })).matter;
  const raw = JSON.stringify(obj(sys, m.matter_id));
  assert.ok(!raw.includes("Bayview")); assert.match(raw, /A256GCM/);
  assert.equal(sys.host.capabilities().encryption.end_to_end, false);
});
test("journal is a verifiable hash chain; tampering is detected", async () => {
  const { m } = await eligibleMatter(sys, a);
  const ev = await a.ai.events(m.matter_id);
  assert.equal(ev.chain.ok, true); assert.ok(ev.chain.length >= 4);
  const j = sys.host.state.journals.get(m.matter_id);
  const saved = j[1].event.event_type; j[1].event.event_type = "intake.eligible_for_further_intake";
  assert.equal(sys.host.verifyChain(j).ok, false);
  j[1].event.event_type = saved; assert.equal(sys.host.verifyChain(j).ok, true);
});
test("webhooks: signed, minimal hints; receivers verify signature, freshness and replay; callback URLs resist SSRF", async () => {
  const got = [];
  const rx = createServer(async (req, res) => { let s = ""; for await (const c of req) s += c; got.push(JSON.parse(s)); res.writeHead(204).end(); });
  await new Promise((r) => rx.listen(0, "127.0.0.1", r));
  try {
    const m = (await a.ai.createMatter(casebrief(), { fictional: true })).matter;
    ok(await a.ai.request("POST", `/olip/v2/matters/${m.matter_id}/subscriptions`, { callback_url: `http://127.0.0.1:${rx.address().port}/hook` }));
    const req = await a.ai.requestConflictScreen(m.matter_id, "org_test_alvarez", SCREEN_FIELDS);
    await userApproves(sys, a.user, req.approval); await a.ai.submitConflictScreen(req.conflict_screen.id, req.approval);
    for (let i = 0; i < 40 && got.length < 2; i++) await new Promise((r) => setTimeout(r, 25));
    assert.ok(got.length >= 2);
    const w = got.find((x) => x.event_type === "intake.screening_requested");
    assert.ok(w); assert.ok(!JSON.stringify(got).includes("Casey"), "no matter content in webhooks");
    const keys = await a.ai.hostKeys(); const seen = new Set();
    assert.equal((await checkWebhook(w, keys, { seen, now: Date.parse(w.sent_at) })).ok, true);
    assert.equal((await checkWebhook(w, keys, { seen, now: Date.parse(w.sent_at) })).reason, "replayed_webhook_id");
    assert.equal((await checkWebhook({ ...w, event_type: "x" }, keys, { seen: new Set(), now: Date.parse(w.sent_at) })).reason, "bad_signature");
    assert.equal((await checkWebhook(w, keys, { seen: new Set(), now: Date.parse(w.sent_at) + 600e3 })).reason, "stale_or_future_timestamp");
  } finally { rx.close(); }
  const m2 = (await a.ai.createMatter(casebrief(), { fictional: true })).matter;
  for (const [url, reason] of [["http://example.test/h", "https_required"], ["https://user:pw@example.test/h", "credentials_in_url"], ["https://169.254.169.254/latest", "blocked_address"], ["https://[::1]/h", "blocked_address"], ["https://10.0.0.5/h", "blocked_address"], ["https://metadata.google.internal/x", "blocked_hostname"], ["https://localhost/x", "blocked_hostname"]])
    assert.equal(expectErr(await a.ai.request("POST", `/olip/v2/matters/${m2.matter_id}/subscriptions`, { callback_url: url }), 422, "OLIP_CALLBACK_URL_REJECTED").error.details.reason, reason, url);
});
test("SSRF checks: DNS answers that point inside are refused (rebinding); public addresses pass; ranges are exact", async () => {
  const fake = (addrs) => async () => addrs.map((address) => ({ address }));
  assert.equal((await checkCallbackUrl("https://hooks.example.test/x", { resolver: fake(["93.184.216.34", "127.0.0.1"]) })).reason, "resolves_to_blocked_address");
  assert.equal((await checkCallbackUrl("https://hooks.example.test/x", { resolver: fake(["93.184.216.34"]) })).ok, true);
  assert.equal((await checkCallbackUrl("http://127.0.0.1:1/x")).reason, "https_required", "loopback only with the explicit test flag");
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) assert.equal(isBlockedAddress(ip), true, ip);
  for (const ip of ["172.32.0.1", "8.8.8.8", "2606:4700::1111"]) assert.equal(isBlockedAddress(ip), false, ip);
});
test("pagination uses a stable cursor", async () => {
  const { m } = await eligibleMatter(sys, a);
  const t = ok(await a.ai.request("POST", `/olip/v2/matters/${m.matter_id}/threads`, { organization_id: "org_test_alvarez" })).thread;
  for (let i = 0; i < 5; i++) await sys.firms.org_test_alvarez.admin.act("stf_test_riley", { event_type: "message.firm_sent", matter_id: m.matter_id, object: { type: "thread", id: t.id }, object_path: `/olip/v2/threads/${t.id}`, post_path: `/olip/v2/threads/${t.id}/messages`, payload: { body: `Fictional ${i}` } });
  const p1 = ok(await a.ai.request("GET", `/olip/v2/threads/${t.id}/messages?limit=2`));
  const p2 = ok(await a.ai.request("GET", `/olip/v2/threads/${t.id}/messages?limit=2&cursor=${p1.next_cursor}`));
  assert.equal(p1.messages.length, 2); assert.equal(p2.messages.length, 2);
  assert.notEqual(p1.messages[0].id, p2.messages[0].id);
});
