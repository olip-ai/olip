// Consultation (time zones, DST, no inferred attendance) and firm-controlled engagement (versioned offers, exact assent).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startSystem, actors, userApproves, staff, acts, eligibleMatter, expectErr, ok, obj, reauth, digestOf } from "./helpers.mjs";
import { checkZonedTime } from "../reference/lib/core.mjs";
let sys, a;
before(async () => { sys = await startSystem({ orgs: ["org_test_alvarez", "org_test_northgate"] }); a = await actors(sys); });
after(() => sys.stop());
// Slots are placed a few days after the test clock, on the whole hour, and rendered in the firm's IANA zone.
const at = (days) => { const d = new Date(sys.clock.now().getTime() + days * 86400e3); d.setUTCMinutes(0, 0, 0); const iso = d.toISOString().replace(".000Z", "Z"); return { start_utc: iso, local_start: checkZonedTime({ start_utc: iso, timezone: "America/Los_Angeles" }).local_start }; };
const slot = (o = {}) => ({ slot_id: "s1", ...at(o.days ?? 5), timezone: "America/Los_Angeles", duration_minutes: 30, mode: "video", as_of: sys.clock.now().toISOString(), ...o, days: undefined });
async function requested() {
  const { m } = await eligibleMatter(sys, a);
  const cr = await a.ai.requestConsultation(m.matter_id, "org_test_alvarez", { modes: ["video"], timezone: "America/Los_Angeles" });
  await userApproves(sys, a.user, cr.approval);
  return { m, c: (await a.ai.submitConsultation(cr.consultation.id, cr.approval)).consultation, sam: await staff(sys, "org_test_alvarez", "stf_test_sam") };
}
async function proposed(slots = [slot()]) {
  const x = await requested();
  ok(await x.sam.act(acts.consultAct(x.c, "consultation.options_offered", { slots, version: 1 })));
  const pr = await a.ai.proposeSlot(x.c.id, slots[0].slot_id); await userApproves(sys, a.user, pr.approval);
  return { ...x, c: (await a.ai.submitProposal(x.c.id, pr.approval)).consultation };
}

test("time zones: IANA zone and UTC instant must agree; DST gaps and unknown zones are refused", () => {
  assert.equal(checkZonedTime({ start_utc: "2026-11-01T08:30:00Z", timezone: "America/New_York", local_start: "2026-11-01T03:30" }).ok, true);
  // fall-back hour 01:30 happens twice in New York on 2026-11-01; each UTC instant names one of them, so both are valid and distinct
  assert.equal(checkZonedTime({ start_utc: "2026-11-01T05:30:00Z", timezone: "America/New_York", local_start: "2026-11-01T01:30" }).ok, true);
  assert.equal(checkZonedTime({ start_utc: "2026-11-01T06:30:00Z", timezone: "America/New_York", local_start: "2026-11-01T01:30" }).ok, true);
  // spring-forward gap: 02:30 local does not exist on 2027-03-14 in New York, so no UTC instant renders as it
  assert.equal(checkZonedTime({ start_utc: "2027-03-14T07:30:00Z", timezone: "America/New_York", local_start: "2027-03-14T02:30" }).ok, false);
  assert.equal(checkZonedTime({ start_utc: "2026-11-20T18:00:00Z", timezone: "Mars/Olympus", local_start: "2026-11-20T10:00" }).reason, "unknown_iana_timezone");
  assert.equal(checkZonedTime({ start_utc: "2026-11-20T10:00:00-08:00", timezone: "America/Los_Angeles" }).reason, "start_utc_must_be_utc_rfc3339");
});
test("a firm slot whose local time and UTC disagree is refused at the protocol boundary", async () => {
  const { c, sam } = await requested();
  const r = expectErr(await sam.act(acts.consultAct(c, "consultation.options_offered", { slots: [slot({ local_start: "1999-01-01T11:00" })], version: 1 })), 422, "OLIP_SCHEMA_INVALID");
  assert.match(r.error.message, /local_time_does_not_match/);
  const past = { ...slot(), start_utc: "2026-01-01T18:00:00Z", local_start: "2026-01-01T10:00" };
  expectErr(await sam.act(acts.consultAct(c, "consultation.options_offered", { slots: [past], version: 1 })), 422, "OLIP_CONSULTATION_SLOT_EXPIRED");
});
test("requested is not confirmed; agents cannot confirm; the firm must confirm the exact proposed slot with a reference", async () => {
  const { c, sam } = await proposed([slot(), slot({ slot_id: "s2", days: 6 })]);
  assert.equal(c.state, "proposed");
  expectErr(await a.ai.request("POST", `/olip/v2/consultations/${c.id}/events`, { event_type: "consultation.confirmed" }), 403, "OLIP_FORBIDDEN");
  expectErr(await a.user.request("POST", `/olip/v2/consultations/${c.id}/events`, { event_type: "consultation.confirmed" }), 403, "OLIP_FIRM_AUTHORITY_REQUIRED");
  expectErr(await sam.act(acts.consultAct(c, "consultation.confirmed", {}, { slot_id: "s2", confirmation_reference: "X" })), 422, "OLIP_CONSULTATION_SLOT_MISMATCH");
  expectErr(await sam.act(acts.consultAct(c, "consultation.confirmed", {}, { slot_id: "s1" })), 422, "OLIP_SCHEMA_INVALID");
  const conf = ok(await sam.act(acts.consultAct(c, "consultation.confirmed", {}, { slot_id: "s1", confirmation_reference: "FICT-1" }))).consultation;
  assert.equal(conf.state, "confirmed"); assert.equal(conf.confirmation.slot.timezone, "America/Los_Angeles");
});
test("time passing never marks attendance; attendance needs a named firm source; users cannot claim it", async () => {
  const { c, sam } = await proposed();
  ok(await sam.act(acts.consultAct(c, "consultation.confirmed", {}, { slot_id: "s1", confirmation_reference: "FICT-2" })));
  sys.clock.advance(10 * 86400); await reauth(sys, a);
  assert.equal(obj(sys, c.id).state, "confirmed", "no automatic completion after the end time");
  expectErr(await a.user.request("POST", `/olip/v2/consultations/${c.id}/events`, { event_type: "consultation.completed" }), 403, "OLIP_FIRM_AUTHORITY_REQUIRED");
  const sam2 = await staff(sys, "org_test_alvarez", "stf_test_sam");
  expectErr(await sam2.act(acts.consultAct(obj(sys, c.id), "consultation.completed")), 422, "OLIP_ATTENDANCE_SOURCE_REQUIRED");
  const done = ok(await sam2.act(acts.consultAct(obj(sys, c.id), "consultation.no_show", {}, { attendance_source: "firm_video_platform_log (fictional)" }))).consultation;
  assert.equal(done.state, "no_show"); assert.match(done.attendance.statement, /does not mean the firm represents you/);
});
test("expired slots cannot be proposed; reschedule needs a new higher-version offer", async () => {
  const x = await requested();
  ok(await x.sam.act(acts.consultAct(x.c, "consultation.options_offered", { slots: [slot({ slot_id: "past", days: 1 })], version: 1 })));
  sys.clock.advance(2 * 86400); await reauth(sys, a);
  expectErr(await a.ai.request("POST", `/olip/v2/consultations/${x.c.id}/proposals`, { slot_id: "past" }), 410, "OLIP_CONSULTATION_SLOT_EXPIRED");
  const sam = await staff(sys, "org_test_alvarez", "stf_test_sam");
  expectErr(await sam.act(acts.consultAct(obj(sys, x.c.id), "consultation.options_offered", { slots: [slot()], version: 1 })), 409, "OLIP_LIFECYCLE_TRANSITION_INVALID");
});
test("user can ask to reschedule a confirmed time; the firm re-offers with a higher version", async () => {
  const { c, sam } = await proposed();
  ok(await sam.act(acts.consultAct(c, "consultation.confirmed", {}, { slot_id: "s1", confirmation_reference: "FICT-3" })));
  const r = ok(await a.user.request("POST", `/olip/v2/consultations/${c.id}/events`, { event_type: "consultation.reschedule_requested" }));
  assert.equal(r.consultation.state, "reschedule_requested");
  expectErr(await sam.act(acts.consultAct(obj(sys, c.id), "consultation.options_offered", { slots: [slot({ slot_id: "s3" })], version: 1 })), 409, "OLIP_REVISION_CONFLICT");
  const again = ok(await sam.act(acts.consultAct(obj(sys, c.id), "consultation.options_offered", { slots: [slot({ slot_id: "s3" })], version: 2 }))).consultation;
  assert.equal(again.state, "options_offered"); assert.equal(again.confirmation, null);
});

// ---------- engagement ----------
async function offered(sys_ = sys, a_ = a, version = 1, extra = {}) {
  const { m } = await eligibleMatter(sys_, a_);
  const avery = await staff(sys_, "org_test_alvarez", "stf_test_avery");
  const letter = Buffer.from(`FICTIONAL ENGAGEMENT LETTER v${version}\n`);
  const up = ok(await avery.host("POST", "/olip/v2/documents/upload-authorizations", { matter_id: m.matter_id, filename: "letter.txt", declared_mime: "text/plain", size: letter.length }));
  const doc = (await sys_.firms.org_test_alvarez.admin.hostCall("PUT", up.upload_url, { content_base64: letter.toString("base64") }, { headers: { "x-olip-upload-token": up.upload_token } })).body.document;
  const target = ok(await avery.host("POST", `/olip/v2/matters/${m.matter_id}/engagements`, {})).engagement;
  const offer = (v) => ({ offer_id: "o1", version: v, terms_summary: `Fictional scope v${v}`, fee_summary: "Fictional fee", valid_until: new Date(sys_.clock.now().getTime() + 86400e3).toISOString(), documents: [{ document_id: doc.id, sha256: doc.sha256, title: "Letter" }], assent_policy: "hosted_otp_click", requires_countersignature: true, representation: { type: "firm" }, ...extra });
  const of = offer(version);
  ok(await avery.act(acts.engageAct(target, "engagement.offered", { offer: of }, { offer_digest: digestOf(of) }, `/olip/v2/matters/${m.matter_id}/engagement-offers`)));
  return { m, e: obj(sys_, target.id), avery, offer, doc };
}
test("offer documents must be firm-uploaded, cleared and hash-matched", async () => {
  const { m, e, avery } = await offered();
  const bad = { offer_id: "o1", version: 2, terms_summary: "x", fee_summary: "x", valid_until: new Date(sys.clock.now().getTime() + 86400e3).toISOString(), documents: [{ document_id: "doc_nope", sha256: "sha256:00", title: "x" }] };
  expectErr(await avery.act(acts.engageAct(e, "engagement.offered", { offer: bad }, { offer_digest: digestOf(bad) }, `/olip/v2/matters/${m.matter_id}/engagement-offers`)), 422, "OLIP_DOCUMENT_NOT_CLEARED");
});
test("a changed offer voids the earlier prepared acceptance; a stale click cannot accept the new version", async () => {
  const { m, e, avery, offer } = await offered();
  const d1 = e.offer.offer_digest;
  const resp = await a.ai.prepareEngagementResponse(e.id, d1);
  const v2 = offer(2);
  ok(await avery.act(acts.engageAct(obj(sys, e.id), "engagement.offered", { offer: v2 }, { offer_digest: digestOf(v2) }, `/olip/v2/matters/${m.matter_id}/engagement-offers`)));
  await assert.rejects(userApproves(sys, a.user, resp.approval), /OLIP_ENGAGEMENT_OFFER_CHANGED/);
  expectErr(await a.ai.request("POST", `/olip/v2/engagement-offers/${e.id}/responses`, { offer_digest: d1 }), 409, "OLIP_ENGAGEMENT_OFFER_CHANGED");
  const r2 = await a.ai.prepareEngagementResponse(e.id, obj(sys, e.id).offer.offer_digest);
  const acc = await userApproves(sys, a.user, r2.approval);
  assert.equal(acc.engagement.state, "user_accepted"); assert.equal(acc.engagement.acceptance.offer_version, 2);
});
test("payment never confirms; confirmation must name the exact acceptance; only the firm attorney confirms", async () => {
  const { e, avery } = await offered();
  const r = await a.ai.prepareEngagementResponse(e.id, e.offer.offer_digest); await userApproves(sys, a.user, r.approval);
  const cur = obj(sys, e.id);
  const pay = ok(await avery.act(acts.engageAct(cur, "engagement.payment_reported", {}, { amount_note: "fictional" })));
  assert.equal(pay.engagement.state, "user_accepted"); assert.match(pay.engagement.payment_note.statement, /does not confirm/);
  expectErr(await avery.act(acts.engageAct(obj(sys, e.id), "engagement.firm_confirmed", {}, { offer_digest: "sha256:wrong", acceptance_id: cur.acceptance.acceptance_id })), 409, "OLIP_ENGAGEMENT_OFFER_CHANGED");
  expectErr(await a.ai.request("POST", `/olip/v2/engagements/${e.id}/events`, { event: { event_type: "engagement.firm_confirmed" } }), 403, "OLIP_FORBIDDEN");
  const c = ok(await avery.act(acts.engageAct(obj(sys, e.id), "engagement.firm_confirmed", {}, { offer_digest: cur.acceptance.offer_digest, acceptance_id: cur.acceptance.acceptance_id }))).engagement;
  assert.equal(c.display_status.text, "Firm reports engagement confirmed");
  assert.doesNotMatch(JSON.stringify(c.display_status), /guarantee|OLIP created/i);
});
test("user decline, firm withdrawal and expiry are distinct outcomes", async () => {
  const x = await offered();
  const r = await a.ai.prepareEngagementResponse(x.e.id, x.e.offer.offer_digest);
  const d = await userApproves(sys, a.user, r.approval, { decision: "decline" });
  assert.equal(d.engagement.state, "user_declined");
  const y = await offered();
  const w = ok(await y.avery.act(acts.engageAct(y.e, "engagement.withdrawn", { reason_text: "Fictional: firm withdrew." }))).engagement;
  assert.equal(w.state, "withdrawn");
  const z = await offered();
  sys.clock.advance(2 * 86400); await reauth(sys, a);
  expectErr(await a.ai.request("POST", `/olip/v2/engagement-offers/${z.e.id}/responses`, {}), 410, "OLIP_ENGAGEMENT_OFFER_EXPIRED");
});
