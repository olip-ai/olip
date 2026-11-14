// The policy gateway (PDP): one decision function for every binding, deciding from server-side state only.
// Covers the decision matrix, fail-closed production mode, unknown/suspended/stale jurisdictions, the mock-mode
// fictional-only rule, operator-only administration, and a policy change between preview and send (time of check vs use).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createPolicy } from "../reference/policy.mjs";
import { createAgentLayer } from "../reference/agent-layer.mjs";
import { ACTION_BY_ID } from "../reference/actions.mjs";
import { startSystem, people, approve, raw, operatorToken, invokeAs, codeOf, casebrief, SCREEN_FIELDS, responseCheck } from "./helpers.mjs";

let sys, who;
before(async () => { sys = await startSystem(); who = await people(sys); });
after(() => sys.stop());
const clock = { now: () => new Date("2026-11-14T17:00:00Z") };
const P = { agent: { kind: "agent", subject_id: "s", client_id: "c" }, user: { kind: "user", subject_id: "s" }, firm: { kind: "firm", organization_id: "o" }, operator: { kind: "operator", operator_id: "op" } };

test("decision matrix: principal and effect decide; approval is required for every external disclosure", () => {
  const pol = createPolicy({ clock });
  const d = (principal, id, extra = {}) => pol.decide({ principal, action: ACTION_BY_ID[id], ...extra });
  assert.equal(d(null, "olip.get_capabilities").decision, "allow");
  assert.equal(d(null, "olip.get_workflow").reason_code, "AUTH_REQUIRED");
  assert.equal(d(P.agent, "olip.record_firm_event").decision, "require_firm_authority");
  assert.equal(d(P.user, "olip.record_firm_event").reason_code, "FIRM_AUTHORITY_REQUIRED");
  assert.equal(d(P.agent, "olip.export_context_capsule").decision, "require_user_approval");
  assert.equal(d(P.agent, "olip.set_jurisdiction_policy").reason_code, "SCOPE_INSUFFICIENT");
  assert.equal(d(P.firm, "olip.set_jurisdiction_policy").reason_code, "SCOPE_INSUFFICIENT");
  assert.equal(d(P.operator, "olip.set_jurisdiction_policy").decision, "allow");
  assert.equal(d(P.agent, "olip.submit_approved_disclosure", { jurisdiction: "US-CA", fictional: true }).decision, "require_user_approval");
  assert.equal(d(P.agent, "olip.submit_approved_disclosure", { jurisdiction: "US-CA", fictional: true, approval: { ok: false, reason_code: "DIGEST_MISMATCH", decision: "deny" } }).reason_code, "DIGEST_MISMATCH");
  assert.equal(d(P.agent, "olip.submit_approved_disclosure", { jurisdiction: "US-CA", fictional: true, approval: { ok: true } }).decision, "allow");
  for (const x of Object.values(P)) assert.match(d(x, "olip.get_capabilities").policy_version, /#1$/);
});
test("jurisdictions fail closed: unknown always, suspended always, stale review dates always, unreviewed in production", () => {
  const mock = createPolicy({ clock });
  const prod = createPolicy({ mode: "production", clock });
  const w = (pol, j, extra = {}) => pol.decide({ principal: P.agent, action: ACTION_BY_ID["olip.start_workflow"], jurisdiction: j, fictional: true, ...extra });
  assert.deepEqual([w(mock, "US-ZZ").decision, w(mock, "US-ZZ").reason_code], ["unknown_policy", "POLICY_UNREVIEWED"]);
  assert.deepEqual([w(mock, null).decision], ["unknown_policy"]);
  assert.equal(w(mock, "US-CA").decision, "allow", "mock mode: fictional matters in a listed jurisdiction");
  assert.equal(w(mock, "US-CA", { fictional: false }).reason_code, "POLICY_UNREVIEWED", "mock mode refuses non-fictional matters");
  assert.equal(w(prod, "US-CA").decision, "unknown_policy", "production: pending_counsel_review is not enough");
  assert.equal(prod.decide({ principal: P.agent, action: ACTION_BY_ID["olip.get_workflow"], jurisdiction: "US-CA" }).decision, "allow", "reads stay available");
  mock.setJurisdiction("US-CA", { status: "suspended" });
  assert.equal(w(mock, "US-CA").decision, "deny");
  mock.setJurisdiction("US-CA", { status: "approved_by_counsel", review_by: "2026-11-01T00:00:00Z" });
  assert.equal(w(mock, "US-CA").reason_code, "POLICY_STALE");
  assert.equal(mock.policyVersion().endsWith("#3"), true, "every change bumps the policy version");
  const approved = createPolicy({ mode: "production", clock, overrides: { "US-CA": { status: "approved_by_counsel", reviewed_at: "2026-11-01T00:00:00Z", review_by: "2027-05-01T00:00:00Z" } } });
  assert.equal(w(approved, "US-CA").decision, "allow");
});
test("production mode on a live host: every regulated write is refused because no jurisdiction is approved by counsel", async () => {
  const prod = createAgentLayer({ v2: sys.v2.host, mode: "production", clock: sys.clock, hostLabel: "prod-check", observe: responseCheck.observe });
  const h = { authorization: `Bearer ${who.alpha.token}` };
  const start = await prod.invoke({ headers: h, actionId: "olip.start_workflow", input: { casebrief: casebrief(), fictional: true }, idempotencyKey: "prod-start-0001" });
  assert.equal(start.status, 422); assert.equal(start.body.error.code, "POLICY_UNREVIEWED");
  assert.equal(start.body.error.details.decision, "unknown_policy");
  const man = await prod.invoke({ actionId: "olip.get_capabilities" });
  assert.equal(man.body.mode, "production"); assert.equal(man.body.fictional_data_only, undefined);
  assert.equal(man.body.policy.jurisdictions["US-CA"].status, "pending_counsel_review");
  assert.equal((await prod.invoke({ headers: h, actionId: "olip.find_professionals", input: { jurisdiction: "US-CA" } })).status, 200);
  prod.close();
  assert.equal([...sys.v2.host.state.objects.values()].filter((o) => o.type === "matter").length, 0, "no matter was created");
});
test("mock mode refuses non-fictional matters and matters in unknown jurisdictions before anything is created", async () => {
  const before = [...sys.v2.host.state.objects.values()].filter((o) => o.type === "matter").length;
  assert.equal(await codeOf(who.alpha.startWorkflow(casebrief(), { fictional: false })), "POLICY_UNREVIEWED");
  assert.equal(await codeOf(who.alpha.startWorkflow(casebrief({ matter: { category: "housing.landlord_tenant", jurisdiction: "US-ZZ" } }))), "POLICY_UNREVIEWED");
  assert.equal([...sys.v2.host.state.objects.values()].filter((o) => o.type === "matter").length, before);
});
test("only the operator can change policy; never an agent, a user or a firm, and never through MCP or A2A", async () => {
  assert.equal((await raw(sys, "POST", "/mock/v3/operator-token", { body: { secret: "wrong" } })).status, 401);
  const input = { jurisdiction: "US-NY", status: "suspended" };
  assert.equal((await invokeAs(sys, who.alpha.token, "olip.set_jurisdiction_policy", input)).body.error.code, "SCOPE_INSUFFICIENT");
  assert.equal((await invokeAs(sys, who.user.token, "olip.set_jurisdiction_policy", input)).body.error.code, "SCOPE_INSUFFICIENT");
  const viaMcp = await sys.layer.invoke({ headers: { authorization: `Bearer ${await operatorToken(sys)}` }, actionId: "olip.set_jurisdiction_policy", input, binding: "mcp", idempotencyKey: "op-mcp-00001" });
  assert.equal(viaMcp.body.error.code, "ACTION_NOT_SUPPORTED");
  const op = await operatorToken(sys);
  const r = await invokeAs(sys, op, "olip.set_jurisdiction_policy", input);
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.rule.status, "suspended");
  await invokeAs(sys, op, "olip.set_jurisdiction_policy", { jurisdiction: "US-NY", status: "pending_counsel_review" });
  const audit = (await raw(sys, "GET", "/mock/v3/audit")).body.audit.filter((x) => x.action === "olip.set_jurisdiction_policy");
  assert.ok(audit.some((x) => x.principal.kind === "operator" && x.status === 200));
  assert.ok(audit.some((x) => x.principal.kind === "agent" && x.reason_code === "SCOPE_INSUFFICIENT"));
});
test("time of check vs time of use: the operator suspends the jurisdiction after the user approved; the send is refused, then allowed after restore", async () => {
  const op = await operatorToken(sys);
  const wf = (await who.alpha.startWorkflow(casebrief())).workflow;
  const pv = (await who.alpha.previewDisclosure(wf.workflow_id, "org_test_alvarez", "screening", SCREEN_FIELDS)).disclosure;
  await approve(sys, who, pv.approval);
  const plan = await who.alpha.planNextActions(wf.workflow_id, "share_screening");
  assert.equal(plan.next_actions.find((x) => x.action === "olip.submit_approved_disclosure").disposition, "allowed");
  await invokeAs(sys, op, "olip.set_jurisdiction_policy", { jurisdiction: "US-CA", status: "suspended" });
  const e = await who.alpha.submitApprovedDisclosure(pv).catch((x) => x);
  assert.equal(e.code, "POLICY_UNREVIEWED"); assert.equal(e.body.error.details.decision, "deny");
  assert.equal([...sys.v2.host.state.objects.values()].filter((o) => o.type === "disclosure" && o.matter_id === wf.matter_id).length, 0, "nothing sent");
  const blocked = await who.alpha.planNextActions(wf.workflow_id, "share_screening");
  assert.equal(blocked.next_actions.find((x) => x.action === "olip.submit_approved_disclosure").disposition, "blocked");
  await invokeAs(sys, op, "olip.set_jurisdiction_policy", { jurisdiction: "US-CA", status: "approved_by_counsel", review_by: "2026-11-01T00:00:00Z" });
  assert.equal(await codeOf(who.alpha.submitApprovedDisclosure(pv)), "POLICY_STALE", "a passed review date fails closed");
  const r = await invokeAs(sys, op, "olip.set_jurisdiction_policy", { jurisdiction: "US-CA", status: "pending_counsel_review", review_by: "2027-11-01T00:00:00Z" });
  const sent = await who.alpha.submitApprovedDisclosure(pv);
  assert.equal(sent.delivery.state, "delivered_to_endpoint");
  assert.equal(sent.action_receipt.policy_version, r.body.policy_version);
  const ev = (await who.alpha.resume(wf.workflow_id)).entries;
  assert.equal(ev.find((x) => x.event_type === "disclosure.submitted").policy_version, r.body.policy_version, "events record the policy version in force");
  assert.notEqual(ev[0].policy_version, r.body.policy_version);
});
