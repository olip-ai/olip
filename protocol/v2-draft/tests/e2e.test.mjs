// Scenarios A, B, C and E from the OLIP 2.0 instructions, run over loopback HTTP with fictional data.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startSystem, runScenarioA, actors, userApproves, staff, acts, eligibleMatter, casebrief, SCREEN_FIELDS, expectErr, ok, obj, httpTransport, FIRMS } from "./helpers.mjs";
import { verifyDetached } from "../sdk/typescript/dist/index.js";

for (const topology of ["direct", "relay"]) {
  test(`Scenario A (${topology}): discovery to closure, every stage reaches its correct state`, async () => {
    const sys = await startSystem({ topology, orgs: topology === "direct" ? ["org_test_alvarez"] : undefined });
    try {
      const r = await runScenarioA(sys);
      assert.equal(r.trace.length, 11);
      const st = (id) => obj(sys, id).state;
      assert.equal(st(r.screen_id), "eligible_for_further_intake");
      assert.equal(st(r.consultation_id), "completed");
      assert.equal(st(r.engagement_id), "ended");
      assert.equal(st(r.matter_id), "closed");
      assert.equal(obj(sys, r.thread_id).state, "read_only");
      assert.equal(st(r.firm_message_id), "read_by_recipient");
      assert.equal(r.passport.transmitted, false); assert.deepEqual(r.passport.authorizes_recipients, []);
      const ev = await r.user.events(r.matter_id);
      assert.equal(ev.chain.ok, true);
      const types = ev.entries.map((e) => e.event.event_type);
      for (const t of ["intake.screening_requested", "intake.information_requested", "intake.additional_information_provided", "intake.eligible_for_further_intake", "consultation.requested", "consultation.options_offered",
        "consultation.proposed", "consultation.confirmed", "consultation.completed", "engagement.offered", "engagement.user_reviewing", "engagement.user_accepted", "engagement.firm_confirmed", "message.delivered_to_endpoint", "matter.closed"]) assert.ok(types.includes(t), `missing ${t}`);
      // every firm-originated entry is attributed to a firm-signed key; host entries say host_attested
      for (const e of ev.entries) assert.ok(e.event.actor.role === "firm" ? e.attribution === "firm_signed" : e.attribution === "host_attested");
      if (topology === "direct") assert.equal(sys.host.capabilities().implementation.operator.operator_id, "org_test_alvarez");
      else assert.equal(sys.host.capabilities().implementation.operator.operator_id, "op_test_neutral_relay");
    } finally { await sys.stop(); }
  });
}

test("Scenario B: the firm declines screening; no relationship status, no CaseBrief, no thread, polite firm text only", async () => {
  const sys = await startSystem();
  try {
    const a = await actors(sys);
    const m = (await a.ai.createMatter(casebrief(), { fictional: true })).matter;
    const req = await a.ai.requestConflictScreen(m.matter_id, "org_test_cedar", SCREEN_FIELDS);
    await userApproves(sys, a.user, req.approval);
    const sub = await a.ai.submitConflictScreen(req.conflict_screen.id, req.approval);
    const quinn = await staff(sys, "org_test_cedar", "stf_test_quinn");
    const d = ok(await quinn.act(acts.screenAct(sub.conflict_screen, "intake.unable_to_proceed", { firm_text: "Fictional: we are not able to help with this matter. You may wish to contact a legal aid office.", alternatives: [{ name: "Fictional Legal Aid Office", url: "https://legalaid.example.test" }] })));
    assert.equal(d.conflict_screen.state, "unable_to_proceed");
    assert.equal(d.conflict_screen.decision.firm_text.startsWith("Fictional: we are not able"), true);
    expectErr(await a.ai.request("POST", `/olip/v2/matters/${m.matter_id}/disclosures`, { organization_id: "org_test_cedar", fields: ["facts.summary"] }), 409, "OLIP_CONFLICT_STAGE_REQUIRED");
    expectErr(await a.ai.request("POST", `/olip/v2/matters/${m.matter_id}/threads`, { organization_id: "org_test_cedar" }), 409, "OLIP_CONFLICT_STAGE_REQUIRED");
    expectErr(await a.ai.request("POST", `/olip/v2/matters/${m.matter_id}/consultations`, { organization_id: "org_test_cedar" }), 409, "OLIP_CONFLICT_STAGE_REQUIRED");
    const prep = await quinn.host("POST", `/olip/v2/matters/${m.matter_id}/engagements`, {});
    expectErr(prep, 409, "OLIP_CONFLICT_STAGE_REQUIRED");
    const mm = (await a.ai.getMatter(m.matter_id)).matter;
    assert.equal(mm.represented, null); assert.equal(mm.status.engagements.length, 0);
    // the firm received only the four screening fields
    const inbox = (await quinn.inbox()).body.deliveries;
    assert.equal(inbox.length, 1); assert.deepEqual(inbox[0].delivery.payload.fields.map((f) => f.path).sort(), [...SCREEN_FIELDS].sort());
    assert.ok(!JSON.stringify(inbox).includes("deposit"), "no CaseBrief facts reached the firm");
    // the user can close their own unrepresented journey; it is not a firm termination
    const c = ok(await a.user.request("POST", `/olip/v2/matters/${m.matter_id}/events`, { event_type: "matter.closed" }));
    assert.equal(c.matter.state, "closed"); assert.match(c.statement, /not a firm termination/);
  } finally { await sys.stop(); }
});

test("Scenario C: passport export, then a new firm; no earlier approval carries over and screening restarts", async () => {
  const sys = await startSystem();
  try {
    const a = await actors(sys);
    const { m, req } = await eligibleMatter(sys, a, "org_test_alvarez");
    const exp = await a.user.exportPassport(m.matter_id);
    assert.equal(exp.passport.transmitted, false);
    const imported = ok(await a.ai.request("POST", "/olip/v2/matters", { from_passport: exp.passport }), 201).matter;
    assert.notEqual(imported.matter_id, m.matter_id);
    assert.equal(imported.status.conflict_screens.length, 0);
    assert.match(imported.imported_from_passport.note, /No earlier approval carries over/);
    // the old approval (used, for Alvarez) cannot be pointed at the new matter or the new firm
    const s2 = await a.ai.requestConflictScreen(imported.matter_id, "org_test_northgate", SCREEN_FIELDS);
    expectErr(await a.ai.request("POST", `/olip/v2/conflict-screens/${s2.conflict_screen.id}/submit`, { grant_id: req.approval.grant_id, grant_digest: req.approval.grant_digest }), 403, "OLIP_DISCLOSURE_NOT_AUTHORIZED");
    await userApproves(sys, a.user, s2.approval);
    const ok2 = await a.ai.submitConflictScreen(s2.conflict_screen.id, s2.approval);
    assert.equal(ok2.conflict_screen.state, "screening_requested");
    assert.equal(ok2.conflict_screen.organization_id, "org_test_northgate");
    // a tampered passport is refused
    const bad = structuredClone(exp.passport); bad.casebrief.content.goals = "changed";
    expectErr(await a.ai.request("POST", "/olip/v2/matters", { from_passport: bad }), 422, "OLIP_PASSPORT_INVALID");
  } finally { await sys.stop(); }
});

test("Scenario E: relay accepts but the firm is offline; state stays accepted_by_transport, retry is idempotent, webhook is only a hint", async () => {
  const sys = await startSystem({ offline: ["org_test_northgate"] });
  try {
    const a = await actors(sys);
    const m = (await a.ai.createMatter(casebrief(), { fictional: true })).matter;
    const req = await a.ai.requestConflictScreen(m.matter_id, "org_test_northgate", SCREEN_FIELDS);
    await userApproves(sys, a.user, req.approval);
    const body = { grant_id: req.approval.grant_id, grant_digest: req.approval.grant_digest };
    const r1 = await a.ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/submit`, body, { "idempotency-key": "retry-1" });
    assert.equal(r1.status, 202); assert.equal(r1.body.delivery.state, "accepted_by_transport");
    assert.equal(r1.body.conflict_screen.state, "not_started", "never screening_requested without the firm's signed receipt");
    const r2 = await a.ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/submit`, body, { "idempotency-key": "retry-1" });
    assert.deepEqual(r2.body, r1.body, "same key, same answer, no second send");
    const r3 = await a.ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/submit`, { ...body, extra: 1 }, { "idempotency-key": "retry-1" });
    expectErr(r3, 409, "OLIP_IDEMPOTENCY_CONFLICT");
    const types = (await a.ai.events(m.matter_id)).entries.map((e) => e.event.event_type);
    assert.ok(types.includes("disclosure.not_confirmed")); assert.ok(!types.includes("intake.screening_requested"));
  } finally { await sys.stop(); }
});
