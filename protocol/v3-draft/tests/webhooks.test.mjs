// Webhook hints: signed, minimal and content-free; callback URLs pass outbound-request (SSRF) checks at subscribe time
// AND at every delivery; redirects are never followed; failures back off and end in a dead letter; polling stays the
// source of truth. Receivers verify the signature, check clock skew and deduplicate on webhook_id.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { checkWebhook } from "../sdk/typescript/dist/index.js";
import { startSystem, people, codeOf, errOf, casebrief, SCREEN_FIELDS } from "./helpers.mjs";

let sys, who, rx, rxBase;
const got = []; let mode = "ok";
before(async () => {
  sys = await startSystem(); who = await people(sys);
  rx = createServer(async (req, res) => {
    let b = ""; for await (const c of req) b += c;
    if (req.url === "/redirect") { res.writeHead(302, { location: `${rxBase}/landing` }).end(); return; }
    if (req.url === "/landing") { got.push({ url: req.url }); res.writeHead(200).end(); return; }
    got.push({ url: req.url, body: JSON.parse(b), headers: req.headers });
    res.writeHead(mode === "ok" ? 204 : 500).end();
  });
  rxBase = await new Promise((r) => rx.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${rx.address().port}`)));
});
after(async () => { await new Promise((r) => rx.close(r)); await sys.stop(); });
async function settle(subId) {
  for (let i = 0; i < 200; i++) {
    const w = [...sys.layer.store.webhooks.values()].filter((x) => x.subscription_id === subId);
    if (w.length && w.every((x) => !["pending", "retrying"].includes(x.status))) return w;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("webhooks did not settle");
}
const bump = async (wf) => who.alpha.cancelPending((await who.alpha.previewDisclosure(wf.workflow_id, "org_test_cedar", "screening", SCREEN_FIELDS)).disclosure.disclosure_id);

test("callback URLs that could reach internal networks are refused when subscribing", async () => {
  const wf = (await who.alpha.startWorkflow(casebrief())).workflow;
  for (const [url, reason] of [["http://example.test/h", "https_required"], ["https://user:pw@example.test/h", "credentials_in_url"], ["https://169.254.169.254/latest", "blocked_address"], ["https://[::1]/h", "blocked_address"], ["https://10.0.0.5/h", "blocked_address"], ["https://192.168.1.10/h", "blocked_address"], ["https://metadata.google.internal/x", "blocked_hostname"], ["https://localhost/x", "blocked_hostname"], ["https://example.test/h#frag", "fragment_not_allowed"]]) { // scan-publication: allow (SSRF test: internal and cloud metadata addresses must be refused)
    const e = await errOf(who.alpha.subscribe(wf.workflow_id, url));
    assert.equal(e?.code, "CALLBACK_URL_REJECTED", url); assert.equal(e.body.error.details.reason, reason, url);
  }
  assert.equal([...sys.layer.store.subscriptions.values()].filter((s) => s.workflow_id === wf.workflow_id).length, 0);
});
test("hints are signed, carry no case content, verify with the SDK, and duplicates and stale hints are rejected by the receiver", async () => {
  mode = "ok"; got.length = 0;
  const wf = (await who.alpha.startWorkflow(casebrief())).workflow;
  const sub = (await who.alpha.subscribe(wf.workflow_id, `${rxBase}/hook`)).subscription;
  assert.equal(sub.verification.dedupe_on, "webhook_id"); assert.equal(sub.delivery.redirects, "never followed");
  await bump(wf);
  const w = await settle(sub.subscription_id);
  assert.ok(w.length >= 2 && w.every((x) => x.status === "delivered"));
  const keys = await who.alpha.keys();
  const seen = new Set();
  const now = sys.clock.now().getTime();
  for (const g of got.filter((x) => x.url === "/hook")) {
    assert.deepEqual(Object.keys(g.body).sort(), ["event_digest", "event_sequence", "event_type", "olip_version", "sent_at", "signature", "statement", "subscription_id", "webhook_id", "workflow_id"]);
    assert.equal(g.headers["olip-webhook-id"], g.body.webhook_id);
    assert.deepEqual(await checkWebhook(g.body, keys, { seen, now }), { ok: true });
    assert.deepEqual(await checkWebhook(g.body, keys, { seen, now }), { ok: false, reason: "duplicate" });
  }
  const one = got.find((x) => x.url === "/hook").body;
  assert.equal((await checkWebhook(one, keys, { seen: new Set(), now: now + 3600e3 })).reason, "stale");
  assert.equal((await checkWebhook({ ...one, event_type: "lifecycle.engagement.firm_confirmed" }, keys, { seen: new Set(), now })).reason, "bad_signature");
  const ev = (await who.alpha.resume(wf.workflow_id)).entries;
  for (const g of got.filter((x) => x.url === "/hook")) assert.equal(ev[g.body.event_sequence - 1].event_digest, g.body.event_digest, "the hint points at a journal entry the client can verify");
  await who.alpha.unsubscribe(sub.subscription_id);
  const before = got.length; await bump(wf); await new Promise((r) => setTimeout(r, 50));
  assert.equal(got.length, before, "a cancelled subscription gets nothing");
});
test("failing receivers get retries with backoff and then a dead letter; redirects are refused and never followed", async () => {
  mode = "fail"; got.length = 0;
  const wf = (await who.alpha.startWorkflow(casebrief())).workflow;
  const sub = (await who.alpha.subscribe(wf.workflow_id, `${rxBase}/hook`)).subscription;
  await bump(wf);
  const w = await settle(sub.subscription_id);
  assert.ok(w.every((x) => x.status === "dead_letter" && x.attempts.length === sys.layer.webhookConfig.maxAttempts && x.attempts.every((a) => a.outcome === "receiver_status_500")));
  await who.alpha.unsubscribe(sub.subscription_id);
  mode = "ok"; got.length = 0;
  const r = (await who.alpha.subscribe(wf.workflow_id, `${rxBase}/redirect`)).subscription;
  await bump(wf);
  const w2 = await settle(r.subscription_id);
  assert.ok(w2.every((x) => x.status === "redirect_refused"));
  assert.equal(got.filter((x) => x.url === "/landing").length, 0, "the redirect target was never contacted");
  await who.alpha.unsubscribe(r.subscription_id);
});
test("the callback URL is checked again at every delivery (e.g. after DNS or configuration changes), and polling still has every event", async () => {
  const wf = (await who.alpha.startWorkflow(casebrief())).workflow;
  const sub = (await who.alpha.subscribe(wf.workflow_id, `${rxBase}/hook`)).subscription;
  sys.layer.store.subscriptions.get(sub.subscription_id).callback_url = "https://10.0.0.7/hook"; // scan-publication: allow (SSRF test: simulates a callback that now points at a private address)
  await bump(wf);
  const w = await settle(sub.subscription_id);
  assert.ok(w.every((x) => x.status === "blocked_blocked_address"), JSON.stringify(w.map((x) => x.status)));
  const polled = (await who.alpha.resume(wf.workflow_id)).entries;
  assert.ok(w.every((x) => polled[x.event_sequence - 1]), "every hinted event is also available by polling");
});
test("only the subscriber's own user can cancel; others get NOT_FOUND", async () => {
  const wf = (await who.alpha.startWorkflow(casebrief())).workflow;
  const sub = (await who.alpha.subscribe(wf.workflow_id, `${rxBase}/hook`)).subscription;
  const morgan = await people(sys, { subject: "usr_test_morgan" });
  assert.equal(await codeOf(morgan.alpha.unsubscribe(sub.subscription_id)), "NOT_FOUND");
  assert.equal((await who.beta.unsubscribe(sub.subscription_id)).subscription.active, false, "the same user's other assistant may cancel (user-scoped)");
});
