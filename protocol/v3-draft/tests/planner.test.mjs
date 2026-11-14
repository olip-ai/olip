// The next-actions planner: a pure, deterministic function of server-side state. Same state, same bytes, same digest;
// no clock and no model. It names procedural steps and their disposition; it never grants anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planNextActions, DISPOSITIONS } from "../reference/planner.mjs";
import { FORBIDDEN_NAME_PATTERNS, ACTION_BY_ID } from "../reference/actions.mjs";
import { digestOf } from "../reference/lib/core.mjs";
import { createResponseChecker } from "../conformance/schema-check.mjs";

const check = createResponseChecker().schemas.get("next-actions-plan");
const base = (over = {}) => ({ workflow_id: "wf_p", head: { sequence: 7, digest: "sha256:" + "a".repeat(64) }, principal_kind: "agent", goal: undefined, policy_version: "p#1",
  lifecycle: { matter: { state: "open" }, conflict_screens: [], consultations: [], engagements: [] }, disclosures: [], grantState: () => "pending", writeGate: () => null, ...over });
const find = (plan, reason) => plan.next_actions.find((a) => a.reason_code === reason);

test("determinism: identical state gives byte-identical plans; input order does not matter; no timestamps", () => {
  const screens = [{ id: "scr_2", organization_id: "org_b", state: "screening_requested" }, { id: "scr_1", organization_id: "org_a", state: "eligible_for_further_intake" }];
  const discl = [{ disclosure_id: "dis_2", organization_id: "org_c", stage: "screening", state: "awaiting_user_approval", approval: { grant_id: "g2" } }, { disclosure_id: "dis_1", organization_id: "org_d", stage: "screening", state: "awaiting_user_approval", approval: { grant_id: "g1" } }];
  const a = planNextActions(base({ lifecycle: { ...base().lifecycle, conflict_screens: screens }, disclosures: discl }));
  const b = planNextActions(base({ lifecycle: { ...base().lifecycle, conflict_screens: [...screens].reverse() }, disclosures: [...discl].reverse() }));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  const { plan_digest, ...rest } = a; assert.equal(plan_digest, digestOf(rest));
  assert.ok(!/\d{4}-\d{2}-\d{2}T/.test(JSON.stringify(a)), "no timestamps in a plan");
  assert.ok(check(a), JSON.stringify(check.errors));
  assert.equal(a.not_authorization, true); assert.equal(a.not_legal_advice, true);
});
test("dispositions follow the lifecycle: firm steps need firm authority, user steps need the user, closed matters block writes", () => {
  const eligible = planNextActions(base({ lifecycle: { ...base().lifecycle, conflict_screens: [{ id: "scr_1", organization_id: "org_a", state: "eligible_for_further_intake" }] } }));
  assert.equal(find(eligible, "CASEBRIEF_NEEDS_SEPARATE_USER_APPROVAL").disposition, "requires_user_approval");
  assert.equal(find(eligible, "CONSULTATION_REQUEST_NEEDS_USER_APPROVAL").operation, "request_consultation");
  const waiting = planNextActions(base({ lifecycle: { ...base().lifecycle, conflict_screens: [{ id: "scr_1", organization_id: "org_a", state: "screening_requested" }] } }));
  assert.equal(find(waiting, "WAITING_FOR_FIRM_SCREENING_RESPONSE").disposition, "requires_firm_authority");
  const accepted = planNextActions(base({ lifecycle: { ...base().lifecycle, engagements: [{ id: "eng_1", organization_id: "org_a", state: "user_accepted" }] } }));
  assert.equal(find(accepted, "CLIENT_ACCEPTANCE_IS_NOT_FIRM_CONFIRMATION").disposition, "requires_firm_authority");
  const closed = planNextActions(base({ lifecycle: { ...base().lifecycle, matter: { state: "closed" }, engagements: [{ id: "eng_1", organization_id: "org_a", state: "firm_confirmed" }] } }));
  assert.ok(closed.next_actions.filter((a) => a.reason_code === "MATTER_CLOSED").length >= 1);
  assert.ok(!closed.next_actions.some((a) => a.disposition === "requires_user_approval" && a.action !== "olip.export_context_capsule"));
  const gated = planNextActions(base({ writeGate: (e) => (e === "external_disclosure" ? "POLICY_UNREVIEWED" : null), disclosures: [{ disclosure_id: "dis_1", organization_id: "org_a", stage: "screening", state: "awaiting_user_approval", approval: { grant_id: "g" } }], grantState: () => "active" }));
  assert.deepEqual([find(gated, "POLICY_UNREVIEWED").action, find(gated, "POLICY_UNREVIEWED").disposition], ["olip.submit_approved_disclosure", "blocked"]);
  for (const [gs, reason] of [["active", "USER_APPROVAL_RECORDED_RECHECKED_AT_EXECUTION"], ["pending", "WAITING_FOR_USER_DECISION"], ["revoked", "GRANT_REVOKED"], ["denied", "USER_DECLINED"], ["expired", "GRANT_EXPIRED"]]) {
    const p = planNextActions(base({ disclosures: [{ disclosure_id: "dis_1", organization_id: "org_a", stage: "screening", state: "awaiting_user_approval", approval: { grant_id: "g" } }], grantState: () => gs }));
    assert.ok(find(p, reason), `${gs} -> ${reason}`);
  }
});
test("only the signed-in user may export a capsule; plans name only real, non-approving actions; goals reorder but never change dispositions", () => {
  assert.equal(planNextActions(base({ principal_kind: "user" })).next_actions.find((a) => a.action === "olip.export_context_capsule").disposition, "allowed");
  assert.equal(planNextActions(base()).next_actions.find((a) => a.action === "olip.export_context_capsule").disposition, "requires_user_approval");
  const state = base({ lifecycle: { ...base().lifecycle, conflict_screens: [{ id: "scr_1", organization_id: "org_a", state: "eligible_for_further_intake" }] } });
  const plain = planNextActions(state), focused = planNextActions({ ...state, goal: "move_to_another_assistant" });
  assert.equal(focused.next_actions[0].action, "olip.export_context_capsule");
  const norm = (p) => p.next_actions.map((a) => JSON.stringify(a)).sort();
  assert.deepEqual(norm(plain), norm(focused));
  for (const p of [plain, focused]) for (const a of p.next_actions) {
    assert.ok(ACTION_BY_ID[a.action], a.action); assert.ok(DISPOSITIONS.includes(a.disposition));
    // Firm steps may NAME the firm's own event (e.g. engagement.firm_confirmed) so the assistant can explain the wait;
    // they are always requires_firm_authority. Anything an assistant could itself call never names an approval.
    if (a.disposition !== "requires_firm_authority") assert.ok(!FORBIDDEN_NAME_PATTERNS.some((re) => re.test(a.action) || re.test(a.operation ?? "")), `${a.action} ${a.operation}`);
    else assert.equal(a.action, "olip.record_firm_event");
  }
});
