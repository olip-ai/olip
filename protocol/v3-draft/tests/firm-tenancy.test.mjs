// Firm authority and tenant isolation. A client agent can never record a firm-authoritative event; a firm can record
// only events the 2.0-draft host verifies (signer, role, scope, key, revision); one user's assistant can never see or act
// on another user's workflow, capsule, subscription or lifecycle object. Missing and forbidden look the same (NOT_FOUND).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { signDetached, keyFromLabel } from "../../v2-draft/reference/lib/core.mjs";
import { startSystem, people, raw, invokeAs, sentScreening, codeOf, casebrief, FIRMS, SCREEN_FIELDS } from "./helpers.mjs";

let sys, casey, morgan;
before(async () => { sys = await startSystem(); casey = await people(sys); morgan = await people(sys, { subject: "usr_test_morgan" }); });
after(() => sys.stop());

async function firmToken(org) {
  const r = await raw(sys, "POST", "/olip/v2/token", { body: { grant_type: "client_credentials", client_id: FIRMS[org].host_credentials.client_id, client_secret: FIRMS[org].host_credentials.secret } });
  return r.body.access_token;
}
function screenEvent(org, screen, event_type, key, actor_id = "stf_test_jordan") {
  return signDetached({ olip_version: "2.0-draft", event_id: `urn:olip:${org}:event:t${Math.random().toString(36).slice(2)}`, matter_id: screen.matter_id, object: { type: "conflict_screen", id: screen.id }, event_type,
    actor: { role: "firm", actor_id, organization_id: org, staff_role: "intake_staff" }, prior_revision: screen.revision, occurred_at: sys.clock.now().toISOString(), idempotency_key: `idem-${Math.random()}`,
    correlation_id: screen.matter_id, causation_id: null, evidence: {}, payload: {}, fictional: true }, key);
}

test("client agents and users can never record firm events, through any binding", async () => {
  const { wf, sent } = await sentScreening(sys, casey);
  const input = { object_type: "conflict_screen", object_id: sent.lifecycle_object.id, event: { event_type: "intake.eligible_for_further_intake" } };
  for (const t of [casey.alpha.token, casey.user.token]) {
    const r = await invokeAs(sys, t, "olip.record_firm_event", input);
    assert.equal(r.body.error.code, "FIRM_AUTHORITY_REQUIRED"); assert.equal(r.body.error.details.decision, "require_firm_authority");
  }
  for (const binding of ["mcp", "a2a"]) assert.equal((await sys.layer.invoke({ headers: { authorization: `Bearer ${casey.alpha.token}` }, actionId: "olip.record_firm_event", input, binding, idempotencyKey: "firm-bind-0001" })).body.error.code, "ACTION_NOT_SUPPORTED");
  // Nor through the lifecycle bridge: firm operations are not on its allowlist.
  assert.equal((await invokeAs(sys, casey.alpha.token, "olip.call_lifecycle", { workflow_id: wf.workflow_id, operation: "post_conflict_screen_event", object_id: sent.lifecycle_object.id })).body.error.code, "SCHEMA_INVALID");
  assert.equal((await casey.alpha.getWorkflow(wf.workflow_id)).workflow.lifecycle.conflict_screens[0].state, "screening_requested");
});
test("a firm records its own signed event through the 3.0 layer; a forged key, another firm, or a stale revision is refused", async () => {
  const { wf, sent } = await sentScreening(sys, casey);
  const screen = { ...sys.v2.host.state.objects.get(sent.lifecycle_object.id) }; // snapshot: the stale replay below reuses this revision
  const alv = await firmToken("org_test_alvarez"), cedar = await firmToken("org_test_cedar");
  const forged = await invokeAs(sys, alv, "olip.record_firm_event", { object_type: "conflict_screen", object_id: screen.id, event: screenEvent("org_test_alvarez", screen, "intake.eligible_for_further_intake", keyFromLabel("attacker/events/1")) });
  assert.ok(forged.status >= 400, JSON.stringify(forged.body)); assert.ok(["FIRM_AUTHORITY_REQUIRED", "UNVERIFIED_EVIDENCE", "SCOPE_INSUFFICIENT"].includes(forged.body.error.code), forged.body.error.code);
  const other = await invokeAs(sys, cedar, "olip.record_firm_event", { object_type: "conflict_screen", object_id: screen.id, event: screenEvent("org_test_cedar", screen, "intake.eligible_for_further_intake", keyFromLabel("org_test_cedar/events/1"), "stf_test_quinn") });
  assert.ok(other.status >= 400); assert.ok(["FIRM_AUTHORITY_REQUIRED", "NOT_FOUND", "SCOPE_INSUFFICIENT"].includes(other.body.error.code), other.body.error.code);
  const good = await invokeAs(sys, alv, "olip.record_firm_event", { object_type: "conflict_screen", object_id: screen.id, event: screenEvent("org_test_alvarez", screen, "intake.eligible_for_further_intake", keyFromLabel("org_test_alvarez/events/1")) });
  assert.equal(good.status, 200, JSON.stringify(good.body));
  const stale = await invokeAs(sys, alv, "olip.record_firm_event", { object_type: "conflict_screen", object_id: screen.id, event: screenEvent("org_test_alvarez", screen, "intake.eligible_for_further_intake", keyFromLabel("org_test_alvarez/events/1")) });
  assert.ok(stale.status >= 400); assert.ok(["CONFLICTING_STATE", "PRECONDITION_MISSING"].includes(stale.body.error.code), JSON.stringify(stale.body.error));
  const ev = (await casey.alpha.resume(wf.workflow_id)).entries.filter((e) => e.actor_type === "firm_authorized_actor");
  assert.equal(ev.length, 1);
  assert.equal(ev[0].v2_ref.attribution_at_mirror, "firm_signed_verified_by_2_0_host");
  assert.equal(ev[0].authority_ref, keyFromLabel("org_test_alvarez/events/1").kid ?? ev[0].authority_ref);
  assert.equal((await casey.alpha.getWorkflow(wf.workflow_id)).workflow.lifecycle.conflict_screens[0].state, "eligible_for_further_intake");
});
test("another user's assistant gets NOT_FOUND for every workflow-scoped action, and learns nothing about existence", async () => {
  const { wf, pv } = await sentScreening(sys, casey);
  const pending = (await casey.alpha.previewDisclosure(wf.workflow_id, "org_test_cedar", "screening", SCREEN_FIELDS)).disclosure;
  const m = morgan.alpha;
  const calls = {
    get_workflow: m.getWorkflow(wf.workflow_id), events: m.listEvents(wf.workflow_id), plan: m.planNextActions(wf.workflow_id),
    preview: m.previewDisclosure(wf.workflow_id, "org_test_cedar", "screening", SCREEN_FIELDS), submit: m.submitApprovedDisclosure(pending), cancel: m.cancelPending(pending.disclosure_id),
    subscribe: m.subscribe(wf.workflow_id, `${sys.base}/hook`), lifecycle: m.lifecycle(wf.workflow_id, "get_conflict_screen", pv.disclosure_id),
  };
  for (const [k, p] of Object.entries(calls)) assert.equal(await codeOf(p), "NOT_FOUND", k);
  assert.equal(await codeOf(m.getWorkflow("wf_does_not_exist")), "NOT_FOUND", "same answer for a workflow that does not exist");
  // Casey's own assistant cannot reach into Morgan's matter through the lifecycle bridge either.
  const mwf = (await m.startWorkflow(casebrief({ prospective_client: { name: "Morgan Lee (fictional)", contact: "morgan@client.example.test" } }))).workflow;
  const mpv = (await m.previewDisclosure(mwf.workflow_id, "org_test_alvarez", "screening", SCREEN_FIELDS)).disclosure;
  const mscreen = [...sys.v2.host.state.objects.values()].find((o) => o.type === "conflict_screen" && o.matter_id === mwf.matter_id);
  assert.equal(await codeOf(casey.alpha.lifecycle(wf.workflow_id, "get_conflict_screen", mscreen.id)), "NOT_FOUND");
  assert.equal(await codeOf(casey.alpha.cancelPending(mpv.disclosure_id)), "NOT_FOUND");
  assert.equal(sys.layer.store.disclosures.get(mpv.disclosure_id).state, "awaiting_user_approval");
});
test("tokens: missing, invalid and expired tokens are refused; a revoked delegation stops the assistant; public reads ignore bad tokens", async () => {
  const wf = (await casey.alpha.startWorkflow(casebrief())).workflow;
  assert.equal((await raw(sys, "GET", `/olip/v3/workflows/${wf.workflow_id}`)).body.error.code, "AUTH_REQUIRED");
  assert.equal((await raw(sys, "GET", `/olip/v3/workflows/${wf.workflow_id}`, { token: "not-a-token" })).body.error.code, "AUTH_REQUIRED");
  assert.equal((await raw(sys, "GET", "/olip/v3/professionals", { token: "not-a-token" })).status, 200);
  const extra = await people(sys);
  const rv = await extra.user2.request("POST", `/olip/v2/agent-delegations/${extra.v2a.delegation.delegation_id}/revoke`, {}, { "idempotency-key": "revoke-del-0001" });
  assert.ok(rv.status < 300, JSON.stringify(rv.body));
  assert.equal(await codeOf(extra.alpha.getWorkflow(wf.workflow_id)), "GRANT_REVOKED");
  sys.clock.advance(16 * 60);
  assert.equal(await codeOf(casey.alpha.getWorkflow(wf.workflow_id)), "AUTH_REQUIRED");
  casey = await people(sys); morgan = await people(sys, { subject: "usr_test_morgan" });
  assert.equal((await casey.alpha.getWorkflow(wf.workflow_id)).workflow.workflow_id, wf.workflow_id);
});
test("the audit log records who, what, decision and policy version, and never case content or tokens", async () => {
  const audit = JSON.stringify((await raw(sys, "GET", "/mock/v3/audit")).body.audit);
  for (const secret of ["Casey Rivera", "Bayview", "deposit", "SYSTEM NOTE", casey.alpha.token, "test-only"]) assert.ok(!audit.includes(secret), secret);
  const rows = (await raw(sys, "GET", "/mock/v3/audit")).body.audit;
  assert.ok(rows.every((r) => r.policy_version && r.action !== undefined && r.correlation_id));
  assert.ok(rows.some((r) => r.reason_code === "FIRM_AUTHORITY_REQUIRED"));
  const store = JSON.stringify([...sys.layer.store.workflows.values(), ...sys.layer.store.journals.values()]);
  assert.ok(!store.includes("Bayview") && !store.includes("SYSTEM NOTE"), "the 3.0 layer stores references, not CaseBrief content");
});
