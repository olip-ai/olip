// Approval-bound disclosure. An assistant can prepare, but only the USER approves, on the 2.0-draft approval page.
// The approval binds one recipient, exact content, purpose and expiry; it is rechecked right before sending, and the
// 2.0-draft host checks again atomically. Retries with the same Idempotency-Key never send twice.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startSystem, people, approve, sentScreening, codeOf, errOf, casebrief, SCREEN_FIELDS, invokeAs } from "./helpers.mjs";

let sys, who;
before(async () => { sys = await startSystem(); who = await people(sys); });
after(() => sys.stop());
const deliveries = (wf) => [...sys.v2.host.state.objects.values()].filter((o) => o.type === "disclosure" && o.matter_id === wf.matter_id).length;
async function prepared(org = "org_test_alvarez") {
  const wf = (await who.alpha.startWorkflow(casebrief())).workflow;
  const pv = (await who.alpha.previewDisclosure(wf.workflow_id, org, "screening", SCREEN_FIELDS)).disclosure;
  return { wf, pv };
}

test("preview sends nothing; the agent cannot approve; submitting before the user decides returns USER_APPROVAL_REQUIRED", async () => {
  const { wf, pv } = await prepared();
  assert.equal(pv.state, "awaiting_user_approval");
  assert.match(pv.approval.approval_url, /^\/olip\/v2\/approvals\//);
  const self = await who.v2a.ai.request("POST", `/olip/v2/approvals/${pv.approval.approval_id}/decision`, { decision: "approve", otp: "000000", grant_digest: pv.approval.grant_digest });
  assert.equal(self.status, 403); assert.equal(self.body.error.code, "OLIP_AGENT_CANNOT_APPROVE");
  const e = await errOf(who.alpha.submitApprovedDisclosure(pv));
  assert.equal(e.code, "USER_APPROVAL_REQUIRED");
  assert.equal(e.body.error.details.decision, "require_user_approval");
  assert.deepEqual(e.body.error.details.missing, ["user_decision_on_approval_page"]);
  assert.equal(deliveries(wf), 0);
});
test("the user declines: nothing is sent and the request needs a new approval", async () => {
  const { wf, pv } = await prepared();
  await approve(sys, who, pv.approval, { decision: "decline" });
  assert.equal(await codeOf(who.alpha.submitApprovedDisclosure(pv)), "USER_APPROVAL_REQUIRED");
  assert.equal(deliveries(wf), 0);
});
test("a changed digest, another request's grant, or another workflow's grant is refused; nothing is sent", async () => {
  const a = await prepared(); const b = await prepared("org_test_cedar");
  await approve(sys, who, a.pv.approval); await approve(sys, who, b.pv.approval);
  assert.equal(await codeOf(who.alpha.invoke("olip.submit_approved_disclosure", { disclosure_id: a.pv.disclosure_id, grant_id: a.pv.approval.grant_id, grant_digest: "sha256:" + "2".repeat(64) })), "DIGEST_MISMATCH");
  assert.equal(await codeOf(who.alpha.invoke("olip.submit_approved_disclosure", { disclosure_id: a.pv.disclosure_id, grant_id: b.pv.approval.grant_id, grant_digest: b.pv.approval.grant_digest })), "RECIPIENT_MISMATCH");
  assert.equal(deliveries(a.wf) + deliveries(b.wf), 0);
  assert.equal((await who.alpha.submitApprovedDisclosure(a.pv)).delivery.state, "delivered_to_endpoint", "the right grant still works");
});
test("the user edits the CaseBrief after approving: the old approval no longer matches and nothing is sent", async () => {
  const { wf, pv } = await prepared();
  await approve(sys, who, pv.approval);
  const m = (await who.user2.request("GET", `/olip/v2/matters/${wf.matter_id}`)).body.matter;
  const cb = casebrief({ adverse_parties: ["A different landlord (fictional)"] });
  const put = await who.user2.request("PUT", `/olip/v2/matters/${wf.matter_id}/casebrief`, { casebrief: cb }, { "if-match": String(m.casebrief.revision), "idempotency-key": "edit-cb-000001" });
  assert.ok(put.status < 300, JSON.stringify(put.body));
  const code = await codeOf(who.alpha.submitApprovedDisclosure(pv));
  assert.ok(["DIGEST_MISMATCH", "GRANT_EXPIRED", "GRANT_REVOKED", "CONFLICTING_STATE"].includes(code), code);
  assert.equal(deliveries(wf), 0);
});
test("a revoked approval and an expired approval are refused", async () => {
  const r = await prepared();
  await approve(sys, who, r.pv.approval);
  const rv = await who.user2.request("POST", `/olip/v2/grants/${r.pv.approval.grant_id}/revoke`, {}, { "idempotency-key": "revoke-g-0001" });
  assert.ok(rv.status < 300, JSON.stringify(rv.body));
  assert.equal(await codeOf(who.alpha.submitApprovedDisclosure(r.pv)), "GRANT_REVOKED");
  const x = await prepared();
  await approve(sys, who, x.pv.approval);
  sys.clock.advance(31 * 60);
  who = await people(sys); // tokens are short-lived; the user signs in again
  assert.equal(await codeOf(who.alpha.submitApprovedDisclosure(x.pv)), "GRANT_EXPIRED");
  const plan = await who.alpha.planNextActions(x.wf.workflow_id);
  assert.equal(plan.next_actions.find((a) => a.action === "olip.submit_approved_disclosure").reason_code, "GRANT_EXPIRED");
  assert.equal(deliveries(r.wf) + deliveries(x.wf), 0);
});
test("cancelled requests cannot be sent, and a delivered one cannot be cancelled or sent again", async () => {
  const c = await prepared();
  await approve(sys, who, c.pv.approval);
  await who.alpha.cancelPending(c.pv.disclosure_id);
  assert.equal(await codeOf(who.alpha.submitApprovedDisclosure(c.pv)), "CONFLICTING_STATE");
  assert.equal(deliveries(c.wf), 0);
  const { wf, pv } = await sentScreening(sys, who);
  assert.equal(await codeOf(who.alpha.cancelPending(pv.disclosure_id)), "CONFLICTING_STATE");
  assert.equal(await codeOf(who.alpha.submitApprovedDisclosure(pv)), "CONFLICTING_STATE", "a new key does not send twice");
  assert.equal(deliveries(wf), 1);
});
test("idempotency: same key replays, a different body conflicts, keys are scoped per caller, and a missing key is refused", async () => {
  const { wf, pv } = await prepared();
  await approve(sys, who, pv.approval);
  const s1 = await who.alpha.submitApprovedDisclosure(pv, { idempotencyKey: "same-key-000001" });
  const s2 = await who.alpha.submitApprovedDisclosure(pv, { idempotencyKey: "same-key-000001" });
  assert.equal(s2.idempotent_replay, true);
  assert.deepEqual(s2.delivery, s1.delivery);
  assert.equal(await codeOf(who.alpha.invoke("olip.submit_approved_disclosure", { disclosure_id: pv.disclosure_id, grant_id: pv.approval.grant_id, grant_digest: "sha256:" + "3".repeat(64) }, { idempotencyKey: "same-key-000001" })), "IDEMPOTENCY_CONFLICT");
  assert.equal(deliveries(wf), 1);
  // Beta reusing Alpha's key gets its own result (here: an error), never Alpha's stored response.
  const beta = await invokeAs(sys, who.beta.token, "olip.submit_approved_disclosure", { disclosure_id: pv.disclosure_id, grant_id: pv.approval.grant_id, grant_digest: pv.approval.grant_digest }, "same-key-000001");
  assert.notEqual(beta.body.idempotent_replay, true);
  assert.equal(beta.body.error.code, "CONFLICTING_STATE");
  const nokey = await fetch(`${sys.base}/olip/v3/disclosures/submit`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${who.alpha.token}` }, body: JSON.stringify({ disclosure_id: pv.disclosure_id, grant_id: pv.approval.grant_id, grant_digest: pv.approval.grant_digest }) });
  assert.equal((await nokey.json()).error.code, "IDEMPOTENCY_KEY_REQUIRED");
});
test("concurrent retries with the same key and with different keys still produce exactly one delivery", async () => {
  const { wf, pv } = await prepared();
  await approve(sys, who, pv.approval);
  const rs = await Promise.allSettled([...Array(4)].map((_, i) => who.alpha.submitApprovedDisclosure(pv, { idempotencyKey: i % 2 ? "race-key-00001" : `race-key-0000${i + 2}` })));
  assert.ok(rs.some((r) => r.status === "fulfilled"));
  for (const r of rs.filter((x) => x.status === "rejected")) assert.ok(["CONFLICTING_STATE", "GRANT_EXPIRED", "IDEMPOTENCY_CONFLICT"].includes(r.reason.code), r.reason.code);
  assert.equal(deliveries(wf), 1);
});
test("prompt-injection text inside the CaseBrief is flagged and kept as data; it changes no approval and no recipient", async () => {
  const chk = await who.alpha.checkCasebrief(casebrief());
  assert.equal(chk.instruction_like_text.found, true);
  assert.equal(chk.transmitted, false); assert.equal(chk.stored, false);
  const { wf, pv } = await prepared();
  assert.equal(pv.organization_id, "org_test_alvarez");
  assert.equal(sys.v2.host.state.grants.get(pv.approval.grant_id).state, "pending");
  assert.equal(deliveries(wf), 0);
});
