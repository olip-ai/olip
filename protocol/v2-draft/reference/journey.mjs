// The full FICTIONAL OLIP 2.0-draft lifecycle (Scenario A), driven only through public HTTP interfaces:
// the assistant uses the TypeScript SDK with a delegated agent token; the user uses the approval page with a session token;
// firm staff use their firm's own admin API, and the firm endpoint signs and posts events to the host.
import { OlipLifecycleClient, verifyDetached } from "../sdk/typescript/dist/index.js";
import { CASEBRIEF, CONSUMERS, AGENT_CLIENTS, FIRMS } from "./fixtures.mjs";
import { httpTransport } from "./system.mjs";
import { digestOf } from "./lib/core.mjs";

export async function actors(sys, { subject = "usr_test_casey", agent = "agt_test_assistant_a", content_access = true } = {}) {
  const user = new OlipLifecycleClient(sys.hostBase);
  await user.negotiate();
  await user.userSession(subject, CONSUMERS[subject].password);
  const d = await user.delegateAgent(agent, content_access);
  const ai = new OlipLifecycleClient(sys.hostBase);
  await ai.negotiate();
  await ai.agentToken(agent, AGENT_CLIENTS[agent].secret, d.delegation_code);
  return { user, ai, delegation: d.delegation };
}
// Tokens are short-lived. After the test clock jumps days ahead, the user signs in again and re-delegates the assistant.
export async function reauth(sys, a, { subject = "usr_test_casey", agent = "agt_test_assistant_a", content_access = true } = {}) {
  await a.user.userSession(subject, CONSUMERS[subject].password);
  const d = await a.user.delegateAgent(agent, content_access);
  await a.ai.agentToken(agent, AGENT_CLIENTS[agent].secret, d.delegation_code);
}
// The user reads the code from their OWN inbox (mock outbox) and approves on the approval page.
export async function userApproves(sys, user, approval, { decision = "approve", code: forced } = {}) {
  const page = await user.getApproval(approval.approval_id);
  const ob = await httpTransport(sys.hostBase).call("GET", "/mock/v2/outbox");
  const code = ob.body.messages.filter((m) => m.approval_id === approval.approval_id).at(-1).code;
  return user.decide(approval.approval_id, decision, forced ?? code, page.approval.grant_digest);
}
export async function staff(sys, org, actorId) {
  const t = sys.topology === "direct" ? { call: (m, p, b, h) => sys.firms[org].handle(m, p, h || {}, b) } : httpTransport(sys.firmBases[org]);
  const pw = FIRMS[org].staff[actorId]?.password ?? FIRMS[org].delegations.find((d) => d.actor_id === actorId).password;
  const lg = await t.call("POST", "/firm/admin/login", { actor_id: actorId, password: pw });
  const H = { authorization: `Bearer ${lg.body.staff_token}` };
  return {
    act: (a) => t.call("POST", "/firm/admin/actions", a, H),
    host: (method, path, body) => t.call("POST", "/firm/admin/host", { method, path, body }, H),
    inbox: () => t.call("GET", "/firm/admin/inbox", null, H),
  };
}
const screenAct = (s, type, payload = {}, evidence = {}) => ({ event_type: type, matter_id: s.matter_id, object: { type: "conflict_screen", id: s.id }, object_path: `/olip/v2/conflict-screens/${s.id}`, post_path: `/olip/v2/conflict-screens/${s.id}/events`, payload, evidence });
const consultAct = (c, type, payload = {}, evidence = {}) => ({ event_type: type, matter_id: c.matter_id, object: { type: "consultation", id: c.id }, object_path: `/olip/v2/consultations/${c.id}`, post_path: `/olip/v2/consultations/${c.id}/events`, payload, evidence });
const engageAct = (e, type, payload = {}, evidence = {}, post) => ({ event_type: type, matter_id: e.matter_id, object: { type: "engagement", id: e.id }, object_path: `/olip/v2/engagements/${e.id}`, post_path: post || `/olip/v2/engagements/${e.id}/events`, payload, evidence });
export const acts = { screenAct, consultAct, engageAct };

const must = (r, what) => { if (!r || r.status >= 400) throw new Error(`${what} failed: ${r?.status} ${JSON.stringify(r?.body)}`); return r.body; };

export async function runScenarioA(sys, { org = "org_test_alvarez", log = () => {} } = {}) {
  const trace = [];
  const step = (n, text, data) => { trace.push({ step: n, text, ...data }); log(`${String(n).padStart(2)}. ${text}`); };
  const who = await actors(sys); const { user, ai } = who;

  // 1. Discovery: alphabetical, payment never affects order; the user picks one organization.
  const rec = await ai.recipients({ jurisdiction: "US-CA", matter: "housing.landlord_tenant" });
  step(1, `Assistant listed ${rec.recipients.length} organizations (alphabetical, paid_influence=${rec.ordering.paid_influence}). The user picked ${FIRMS[org].display_name}.`, { recipients: rec.recipients.map((r) => r.organization_id) });

  // 2. Minimal screening preview, approved by the user (not the assistant).
  const m = (await ai.createMatter(CASEBRIEF, { fictional: true })).matter;
  const q = await ai.intakeQuestions(org, "screening");
  const req = await ai.requestConflictScreen(m.matter_id, org, ["prospective_client.name", "adverse_parties", "matter.category", "matter.jurisdiction"]);
  const tryAgent = await ai.request("POST", `/olip/v2/approvals/${req.approval.approval_id}/decision`, { decision: "approve", otp: "123456", grant_digest: req.approval.grant_digest });
  await userApproves(sys, user, req.approval);
  step(2, `Screening preview shows ${q.fields.length} firm-listed fields; 4 chosen. Assistant's own approval attempt -> ${tryAgent.status} ${tryAgent.body.error.code}. User approved with their code.`);

  // 3. Firm endpoint signs a receipt; the host verifies it against the firm's published key.
  const sub = await ai.submitConflictScreen(req.conflict_screen.id, req.approval);
  step(3, `Screening delivered: ${sub.delivery.state}, receipt ${sub.delivery.receipt.receipt_id} signed by ${sub.delivery.receipt.signature.kid}. Screen state: ${sub.conflict_screen.state}.`);

  // 4. Firm asks for one more screening field; only that field is shared, after its own approval.
  const jordan = await staff(sys, org, "stf_test_jordan");
  must(await jordan.act(screenAct(sub.conflict_screen, "intake.information_requested", { fields: [{ path: "related_parties", question: "Is anyone else on the lease?" }] })), "information_requested");
  const add = must(await ai.request("POST", `/olip/v2/conflict-screens/${sub.conflict_screen.id}/additional-information`, { fields: ["related_parties"] }), "additional info");
  await userApproves(sys, user, add.approval);
  const addSent = must(await ai.request("POST", `/olip/v2/conflict-screens/${sub.conflict_screen.id}/additional-information/submit`, add.approval), "submit additional");
  step(4, `Firm asked for related_parties only. User approved that one field. State: ${addSent.conflict_screen.state}.`);

  // 5. Firm says intake may continue; the user separately approves the fuller CaseBrief.
  const elig = must(await jordan.act(screenAct(addSent.conflict_screen, "intake.eligible_for_further_intake")), "eligible");
  const cb = await ai.requestCasebriefDisclosure(m.matter_id, org, FIRMS[org].casebrief_fields);
  await userApproves(sys, user, cb.approval);
  const cbs = await ai.submitCasebriefDisclosure(m.matter_id, cb.approval);
  step(5, `Firm (intake staff) signed eligible_for_further_intake (not a conflict clearance). User approved the fuller CaseBrief separately: ${cbs.delivery.state}.`, { eligible_entry: elig.entry_seq });

  // 6. Consultation: requested, firm offers a slot (IANA zone + UTC), user proposes, firm confirms.
  const cr = await ai.requestConsultation(m.matter_id, org, { modes: ["video"], timezone: "America/Los_Angeles" });
  await userApproves(sys, user, cr.approval);
  const c1 = (await ai.submitConsultation(cr.consultation.id, cr.approval)).consultation;
  const sam = await staff(sys, org, "stf_test_sam");
  const slot = { slot_id: "slot-1", start_utc: "2026-11-18T18:00:00Z", timezone: "America/Los_Angeles", local_start: "2026-11-18T10:00", duration_minutes: 30, mode: "video", as_of: sys.clock.now().toISOString() };
  must(await sam.act(consultAct(c1, "consultation.options_offered", { slots: [slot], version: 1 })), "options_offered");
  const pr = await ai.proposeSlot(c1.id, "slot-1");
  await userApproves(sys, user, pr.approval);
  const c2 = (await ai.submitProposal(c1.id, pr.approval)).consultation;
  const c3 = must(await sam.act(consultAct(c2, "consultation.confirmed", {}, { slot_id: "slot-1", confirmation_reference: "FICTIONAL-CAL-0001" })), "confirmed").consultation;
  step(6, `Consultation confirmed by the firm's scheduler for ${c3.confirmation.slot.local_start} ${c3.confirmation.slot.timezone} (${c3.confirmation.slot.start_utc}).`);

  // 7. Firm attests completion (source named). No engagement is implied.
  sys.clock.advance(4 * 24 * 3600); await reauth(sys, who);
  const c4 = must(await sam.act(consultAct(c3, "consultation.completed", {}, { attendance_source: "firm_calendar_attendance_record (fictional)" })), "completed").consultation;
  const engagementsAfterConsult = (await ai.getMatter(m.matter_id)).matter.status.engagements.length;
  step(7, `Firm reports consultation ${c4.state} (source: ${c4.attendance.attendance_source}). Engagements on record: ${engagementsAfterConsult}.`);

  // 8. Firm uploads the fictional engagement letter, signs a versioned offer bound to its SHA-256; the user reviews and accepts.
  const avery = await staff(sys, org, "stf_test_avery");
  const letter = Buffer.from("FICTIONAL ENGAGEMENT LETTER (test only). Scope: deposit dispute. Fee: fictional flat fee of 500 dollars.\n", "utf8");
  const up = must(await avery.host("POST", "/olip/v2/documents/upload-authorizations", { matter_id: m.matter_id, filename: "engagement-letter.txt", declared_mime: "text/plain", size: letter.length, purpose: "engagement_letter" }), "upload auth");
  const doc = (await sys.firms[org].admin.hostCall("PUT", up.upload_url, { content_base64: letter.toString("base64") }, { headers: { "x-olip-upload-token": up.upload_token } })).body.document;
  const target = must(await avery.host("POST", `/olip/v2/matters/${m.matter_id}/engagements`, {}), "engagement target").engagement;
  const offer = { offer_id: "offer-1", version: 1, terms_summary: "Fictional: represent you in the deposit dispute with Bayview Rentals LLC (fictional).", fee_summary: "Fictional flat fee of 500 dollars.", valid_until: new Date(sys.clock.now().getTime() + 7 * 86400e3).toISOString(),
    documents: [{ document_id: doc.id, sha256: doc.sha256, title: "Engagement letter (fictional)" }], assent_policy: "hosted_otp_click", requires_countersignature: true, representation: { type: "firm", responsible_actor_id: "stf_test_avery" } };
  must(await avery.act(engageAct(target, "engagement.offered", { offer }, { offer_digest: digestOf(offer) }, `/olip/v2/matters/${m.matter_id}/engagement-offers`)), "offer");
  const e1 = (await ai.getEngagement(target.id)).engagement;
  const resp = await ai.prepareEngagementResponse(e1.id, e1.offer.offer_digest);
  const acc = await userApproves(sys, user, resp.approval);
  step(8, `Firm offered version ${e1.offer.version} (letter ${doc.sha256.slice(0, 19)}...). User reviewed and accepted: ${acc.engagement.state}.`);

  // 9. Only the firm's attorney can sign firm_confirmed. The UI text is qualified.
  const riley = await staff(sys, org, "stf_test_riley");
  const e2 = (await ai.getEngagement(e1.id)).engagement;
  const tryParalegal = await riley.act(engageAct(e2, "engagement.firm_confirmed", {}, { offer_digest: e2.acceptance.offer_digest, acceptance_id: e2.acceptance.acceptance_id }));
  const conf = must(await avery.act(engageAct(e2, "engagement.firm_confirmed", {}, { offer_digest: e2.acceptance.offer_digest, acceptance_id: e2.acceptance.acceptance_id })), "firm_confirmed").engagement;
  step(9, `Paralegal attempt -> ${tryParalegal.status} ${tryParalegal.body.error.code}. Attorney signed: "${conf.display_status.text}". ${conf.display_status.qualifier}`);

  // 10. Messages and documents with per-action approval; truthful delivery and read states.
  const engagedThread = [...sys.host.state.objects.values()].find((o) => o.type === "thread" && o.matter_id === m.matter_id && o.purpose === "engaged");
  const d1 = await ai.draftMessage(engagedThread.id, "Fictional: here is my move-out checklist. Please confirm next steps.");
  await userApproves(sys, user, d1.approval);
  const s1 = await ai.sendAuthorized(d1.message.id, d1.approval);
  const pdf = Buffer.from("%PDF-1.4\n% fictional test document\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "latin1");
  const ua = await ai.request("POST", "/olip/v2/documents/upload-authorizations", { matter_id: m.matter_id, filename: "../../move-out checklist.pdf", declared_mime: "application/pdf", size: pdf.length });
  const ud = await ai.request("PUT", ua.body.upload_url, { content_base64: pdf.toString("base64") }, { "x-olip-upload-token": ua.body.upload_token });
  const dt = await ai.request("POST", `/olip/v2/threads/${engagedThread.id}/documents`, { document_id: ud.body.document.id });
  await userApproves(sys, user, dt.body.approval);
  const ds = await ai.request("POST", `/olip/v2/threads/${engagedThread.id}/documents`, { document_id: ud.body.document.id, ...dt.body.approval });
  const fm = engagedThread && await sys.firms[org].admin.act("stf_test_riley", { event_type: "message.firm_sent", matter_id: m.matter_id, object: { type: "thread", id: engagedThread.id }, object_path: `/olip/v2/threads/${engagedThread.id}`, post_path: `/olip/v2/threads/${engagedThread.id}/messages`, payload: { body: "Fictional: thanks, we received your checklist. We will write to the landlord this week.", category: "substantive", drafting: { ai_assisted: false, reviewed_by: null } } });
  await user.request("POST", `/olip/v2/messages/${fm.body.message.id}/read`, {});
  const firmRead = await sys.firms[org].admin.act("stf_test_avery", { event_type: "message.read_by_recipient", matter_id: m.matter_id, object: { type: "message", id: d1.message.id }, prior_revision: sys.host.state.objects.get(d1.message.id).revision, post_path: `/olip/v2/messages/${d1.message.id}/events` });
  const list = await ai.messages(engagedThread.id);
  step(10, `Client message: ${s1.message.state} -> firm read receipt: ${firmRead.body.message?.state}. Document "${ud.body.document.filename}" sent: ${ds.body.delivery.state}. Firm reply read by user: ${list.messages.find((x) => x.id === fm.body.message.id).state}.`);

  // 11. Firm closes the matter (signed); user exports a passport that transmits nothing.
  const mm = (await ai.getMatter(m.matter_id)).matter;
  must(await avery.act({ event_type: "matter.closed", matter_id: m.matter_id, object: { type: "matter", id: m.matter_id }, object_path: `/olip/v2/matters/${m.matter_id}`, post_path: `/olip/v2/matters/${m.matter_id}/events`, payload: { notice_text: "Fictional: your matter is resolved and closed. We keep records as required." } }), "close");
  const exp = await user.exportPassport(m.matter_id);
  const pv = await verifyDetached(exp.passport, await user.hostKeys());
  step(11, `Firm closed the matter. Passport ${exp.passport.passport_id} signature ok=${pv.ok}, transmitted=${exp.passport.transmitted}, authorizes=${JSON.stringify(exp.passport.authorizes_recipients)}.`);

  return { trace, matter_id: m.matter_id, user, ai, passport: exp.passport, thread_id: engagedThread.id, engagement_id: e1.id, consultation_id: c1.id, screen_id: req.conflict_screen.id, document_id: ud.body.document.id, firm_message_id: fm.body.message.id };
}
