// Firm-only authority over firm outcomes, signed events, replay, staleness, revocation and contradictions.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startSystem, actors, userApproves, staff, acts, eligibleMatter, casebrief, SCREEN_FIELDS, expectErr, ok, obj, rawFirmEvent, firmEvent, keyFromLabel, digestOf, signDetached } from "./helpers.mjs";
let sys, a;
before(async () => { sys = await startSystem(); a = await actors(sys); });
after(() => sys.stop());
async function submitted() {
  const m = (await a.ai.createMatter(casebrief(), { fictional: true })).matter;
  const req = await a.ai.requestConflictScreen(m.matter_id, "org_test_alvarez", SCREEN_FIELDS);
  await userApproves(sys, a.user, req.approval);
  return { m, s: (await a.ai.submitConflictScreen(req.conflict_screen.id, req.approval)).conflict_screen };
}
const screenEv = (s, type, more = {}) => ({ path: `/olip/v2/conflict-screens/${s.id}/events`, event: firmEvent(sys, "org_test_alvarez", { actor_id: "stf_test_jordan", object: { type: "conflict_screen", id: s.id }, matter_id: s.matter_id, event_type: type, prior_revision: obj(sys, s.id).revision, ...more }) });

test("agents and users cannot post firm events, whatever they put in the body", async () => {
  const { s } = await submitted();
  const { event } = screenEv(s, "intake.eligible_for_further_intake");
  expectErr(await a.ai.request("POST", `/olip/v2/conflict-screens/${s.id}/events`, { event }), 403, "OLIP_FORBIDDEN");
  expectErr(await a.user.request("POST", `/olip/v2/conflict-screens/${s.id}/events`, { event }), 403, "OLIP_FORBIDDEN");
  assert.equal(obj(sys, s.id).state, "screening_requested");
});
test("a host-signed (or any non-firm-key) event is refused even with the firm's token", async () => {
  const { s } = await submitted();
  const e = screenEv(s, "intake.eligible_for_further_intake", { key: sys.host.hostKey });
  expectErr(await rawFirmEvent(sys, "org_test_alvarez", e), 422, "OLIP_EVENT_SIGNATURE_INVALID");
  const e2 = screenEv(s, "intake.eligible_for_further_intake", { key: keyFromLabel("attacker") });
  expectErr(await rawFirmEvent(sys, "org_test_alvarez", e2), 422, "OLIP_EVENT_SIGNATURE_INVALID");
  const e3 = screenEv(s, "intake.eligible_for_further_intake"); e3.event.payload = { tampered: true };
  expectErr(await rawFirmEvent(sys, "org_test_alvarez", e3), 422, "OLIP_EVENT_SIGNATURE_INVALID");
});
test("staff without the role: refused by the firm's own system AND by the host if signed anyway", async () => {
  const { m } = await eligibleMatter(sys, a);
  const avery = await staff(sys, "org_test_alvarez", "stf_test_avery");
  const target = ok(await avery.host("POST", `/olip/v2/matters/${m.matter_id}/engagements`, {})).engagement;
  const riley = await staff(sys, "org_test_alvarez", "stf_test_riley");
  expectErr(await riley.act(acts.engageAct(target, "engagement.firm_confirmed", {}, {})), 403, "OLIP_FIRM_AUTHORITY_REQUIRED");
  const forced = await riley.act({ ...acts.engageAct(target, "engagement.firm_confirmed", {}, {}), skip_local_role_check: true });
  expectErr(forced, 403, "OLIP_FIRM_AUTHORITY_REQUIRED");
  assert.match(forced.body.error.message, /not authorized stf_test_riley/);
});
test("a firm cannot see or act on another firm's objects (404)", async () => {
  const { s } = await submitted();
  const kim = await staff(sys, "org_test_northgate", "stf_test_kim");
  expectErr(await kim.host("GET", `/olip/v2/conflict-screens/${s.id}`), 404, "OLIP_NOT_FOUND");
  expectErr(await kim.host("GET", `/olip/v2/matters/${s.matter_id}`), 404, "OLIP_NOT_FOUND");
  const forged = firmEvent(sys, "org_test_northgate", { actor_id: "stf_test_kim", object: { type: "conflict_screen", id: s.id }, matter_id: s.matter_id, event_type: "intake.eligible_for_further_intake", prior_revision: obj(sys, s.id).revision });
  expectErr(await rawFirmEvent(sys, "org_test_northgate", { path: `/olip/v2/conflict-screens/${s.id}/events`, event: forged }), 404, "OLIP_NOT_FOUND");
});
test("replayed, stale, future and out-of-order events are refused; exact duplicates are idempotent", async () => {
  const { s } = await submitted();
  const e = screenEv(s, "intake.information_requested", { payload: { fields: [{ path: "related_parties", question: "?" }] } });
  ok(await rawFirmEvent(sys, "org_test_alvarez", e));
  const dup = ok(await sys.firms.org_test_alvarez.admin.hostCall("POST", e.path, { event: e.event }));
  assert.equal(dup.duplicate, true);
  const reused = { ...e.event, payload: { fields: [] }, idempotency_key: "different-key" };
  expectErr(await rawFirmEvent(sys, "org_test_alvarez", { path: e.path, event: signDetached(reused, sys.firms.org_test_alvarez.admin.activeKey) }), 409, "OLIP_EVENT_REPLAYED");
  const stale = screenEv(s, "intake.eligible_for_further_intake", { occurred_at: new Date(sys.clock.now().getTime() - 3600e3).toISOString() });
  expectErr(await rawFirmEvent(sys, "org_test_alvarez", stale), 422, "OLIP_EVENT_STALE");
  const future = screenEv(s, "intake.eligible_for_further_intake", { occurred_at: new Date(sys.clock.now().getTime() + 3600e3).toISOString() });
  expectErr(await rawFirmEvent(sys, "org_test_alvarez", future), 422, "OLIP_EVENT_STALE");
  const wrongRev = screenEv(s, "intake.eligible_for_further_intake", { prior_revision: 99 });
  expectErr(await rawFirmEvent(sys, "org_test_alvarez", wrongRev), 409, "OLIP_REVISION_CONFLICT");
  const illegal = screenEv(s, "intake.screening_requested");
  expectErr(await rawFirmEvent(sys, "org_test_alvarez", illegal), 403, "OLIP_FIRM_AUTHORITY_REQUIRED");
});
test("two validly signed contradictory events at one revision are flagged, never silently resolved", async () => {
  const { m, s } = await submitted();
  const rev = obj(sys, s.id).revision;
  ok(await rawFirmEvent(sys, "org_test_alvarez", screenEv(s, "intake.eligible_for_further_intake", { prior_revision: rev })));
  const contra = screenEv(s, "intake.unable_to_proceed", { prior_revision: rev, payload: { firm_text: "Fictional: cannot proceed." } });
  const r = expectErr(await rawFirmEvent(sys, "org_test_alvarez", contra), 409, "OLIP_EVENT_CONFLICT");
  assert.ok(r.error.reconciliation_id);
  assert.equal(obj(sys, s.id).state, "eligible_for_further_intake");
  const recs = ok(await a.ai.request("GET", `/olip/v2/matters/${m.matter_id}/reconciliations`)).reconciliations;
  assert.equal(recs.length, 1); assert.equal(recs[0].status, "needs_firm_reconciliation");
  assert.equal((await a.ai.getMatter(m.matter_id)).matter.status.conflict_screens[0].reconciliation_required, true);
});
test("revoked staff: the firm's new signed authority document makes the host refuse that actor", async () => {
  const { s } = await submitted();
  sys.firms.org_test_alvarez.admin.revokeStaff("stf_test_jordan");
  expectErr(await rawFirmEvent(sys, "org_test_alvarez", screenEv(s, "intake.eligible_for_further_intake")), 403, "OLIP_FIRM_AUTHORITY_REQUIRED");
});
test("key rotation, revocation and compromise: old key refused after revocation; compromise downgrades earlier claims", async () => {
  const sys2 = await startSystem({ orgs: ["org_test_alvarez"] }); const b = await actors(sys2);
  try {
    const { m, screen } = await eligibleMatter(sys2, b);
    const admin = sys2.firms.org_test_alvarez.admin;
    const oldKid = admin.activeKey.kid;
    let ev = (await b.ai.events(m.matter_id)).entries.find((e) => e.event.event_type === "intake.eligible_for_further_intake");
    assert.equal(ev.attribution, "firm_signed");
    const oldKey = admin.activeKey;
    admin.rotateKey(); admin.revokeKey(oldKid, "superseded");
    const s2 = await b.ai.requestConflictScreen(m.matter_id, "org_test_alvarez", SCREEN_FIELDS);
    await userApproves(sys2, b.user, s2.approval); const sub = await b.ai.submitConflictScreen(s2.conflict_screen.id, s2.approval);
    assert.equal(sub.delivery.receipt.signature.kid !== oldKid, true, "receipts now use the new key");
    sys2.clock.advance(1);
    const withOld = firmEvent(sys2, "org_test_alvarez", { actor_id: "stf_test_jordan", object: { type: "conflict_screen", id: sub.conflict_screen.id }, matter_id: m.matter_id, event_type: "intake.eligible_for_further_intake", prior_revision: obj(sys2, sub.conflict_screen.id).revision, key: oldKey });
    expectErr(await rawFirmEvent(sys2, "org_test_alvarez", { path: `/olip/v2/conflict-screens/${sub.conflict_screen.id}/events`, event: withOld }), 422, "OLIP_KEY_REVOKED");
    ev = (await b.ai.events(m.matter_id)).entries.find((e) => e.event.event_type === "intake.eligible_for_further_intake");
    assert.equal(ev.attribution, "firm_signed", "superseded (not compromised) keys keep earlier attribution");
    // later the OLD key is found to have been compromised: earlier claims it signed are downgraded at read time
    sys2.firms.org_test_alvarez.admin.revokeKey(oldKid, "key_compromise");
    ev = (await b.ai.events(m.matter_id)).entries.find((e) => e.event.event_type === "intake.eligible_for_further_intake");
    assert.equal(ev.attribution, "downgraded_signing_key_compromised");
  } finally { await sys2.stop(); }
});
test("a delegated legal-software adapter may record consultation events only", async () => {
  const { m } = await eligibleMatter(sys, a);
  const cr = await a.ai.requestConsultation(m.matter_id, "org_test_alvarez", { modes: ["phone"], timezone: "America/Los_Angeles" });
  await userApproves(sys, a.user, cr.approval); const c = (await a.ai.submitConsultation(cr.consultation.id, cr.approval)).consultation;
  const adp = await staff(sys, "org_test_alvarez", "adp_test_docket");
  const slot = { slot_id: "s1", start_utc: "2026-11-20T17:00:00Z", timezone: "America/Los_Angeles", local_start: "2026-11-20T09:00", duration_minutes: 20, mode: "phone", as_of: sys.clock.now().toISOString() };
  ok(await adp.act(acts.consultAct(c, "consultation.options_offered", { slots: [slot], version: 1 })));
  const avery = await staff(sys, "org_test_alvarez", "stf_test_avery");
  const target = ok(await avery.host("POST", `/olip/v2/matters/${m.matter_id}/engagements`, {})).engagement;
  expectErr(await adp.act({ ...acts.engageAct(target, "engagement.withdrawn"), skip_local_role_check: true }), 403, "OLIP_FIRM_AUTHORITY_REQUIRED");
});
