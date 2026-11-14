// Writes the five OLIP 2.0-draft lifecycle state machines and the cross-machine invariants.
// The 1.0 handoff machine (../spec/status-machine.json) is NOT touched and is NOT extended.
import fs from "node:fs";
const out = new URL("../status-machines/", import.meta.url);
const V = "2.0-draft";
const T = (event_type, from, to, actors, evidence = [], note) => ({ event_type, from: [].concat(from), to, actors, evidence, ...(note ? { note } : {}) });
const M = (machine, object_type, initial, states, transitions, notes) => ({
  $schema: "https://olip.ai/spec/2.0-draft/schemas/state-machine.schema.json", olip_version: V, status: "proposed_draft_not_adopted", machine, object_type, initial, states, transitions, notes });
const S = (meaning, terminal = false) => ({ meaning, terminal });

const machines = [
  M("intake", "conflict_screen", "not_started", {
    not_started: S("No screening data has been sent to this organization."),
    screening_requested: S("The user approved a minimal screening disclosure and the organization's endpoint signed a receipt for it. Nobody at the organization has decided anything yet."),
    information_requested: S("The organization asked for specific additional screening facts. The user decides whether to share each one."),
    eligible_for_further_intake: S("The organization says intake may continue. This is NOT a conflict clearance finding and NOT representation."),
    unable_to_proceed: S("The organization says it cannot continue. Only the organization's own approved text is shown.", true),
    withdrawn: S("The user withdrew from this screening. Data already received by the organization may be kept under its own duties.", true),
  }, [
    T("intake.screening_requested", "not_started", "screening_requested", ["lifecycle_host"], ["user_disclosure_grant", "recipient_signed_receipt"]),
    T("intake.information_requested", ["screening_requested"], "information_requested", ["firm"], ["firm_signature", "firm_authority"]),
    T("intake.additional_information_provided", "information_requested", "screening_requested", ["lifecycle_host"], ["user_disclosure_grant", "recipient_signed_receipt"]),
    T("intake.eligible_for_further_intake", ["screening_requested", "information_requested"], "eligible_for_further_intake", ["firm"], ["firm_signature", "firm_authority"]),
    T("intake.unable_to_proceed", ["screening_requested", "information_requested", "eligible_for_further_intake"], "unable_to_proceed", ["firm"], ["firm_signature", "firm_authority"]),
    T("intake.withdrawn", ["not_started", "screening_requested", "information_requested", "eligible_for_further_intake"], "withdrawn", ["consumer"], ["authenticated_user_action"]),
  ], ["A new screening after new facts is a NEW conflict_screen object that references the earlier one (supersedes). History is never edited.",
      "No agent or host may produce eligible_for_further_intake. No matching algorithm produces a conflict clearance."]),

  M("consultation", "consultation", "not_requested", {
    not_requested: S("No consultation has been asked for."),
    requested: S("The user approved a consultation request and the organization's endpoint signed a receipt. No time is agreed."),
    options_offered: S("The organization offered specific times. Offered is not booked."),
    proposed: S("The user picked one offered time. It is not confirmed until the organization confirms it."),
    confirmed: S("The organization's scheduling system confirmed this time and time zone."),
    reschedule_requested: S("One side asked to move a confirmed time. The old time is no longer confirmed."),
    completed: S("The organization reports the consultation took place (source named). A consultation is not representation.", true),
    no_show: S("The organization reports the user did not attend (source named).", true),
    declined: S("The organization declined to schedule a consultation.", true),
    cancelled: S("The user or the organization cancelled.", true),
    expired: S("The offered or proposed times passed before confirmation.", true),
  }, [
    T("consultation.requested", "not_requested", "requested", ["lifecycle_host"], ["user_disclosure_grant", "recipient_signed_receipt"]),
    T("consultation.options_offered", ["requested", "reschedule_requested"], "options_offered", ["firm"], ["firm_signature", "firm_authority", "slots_with_iana_timezone"]),
    T("consultation.proposed", "options_offered", "proposed", ["lifecycle_host"], ["user_disclosure_grant", "recipient_signed_receipt"]),
    T("consultation.confirmed", "proposed", "confirmed", ["firm"], ["firm_signature", "firm_authority", "confirmation_reference", "slot_matches_proposal"]),
    T("consultation.reschedule_requested", "confirmed", "reschedule_requested", ["firm", "consumer"], ["firm_signature_or_authenticated_user_action"]),
    T("consultation.completed", "confirmed", "completed", ["firm"], ["firm_signature", "firm_authority", "attendance_source"]),
    T("consultation.no_show", "confirmed", "no_show", ["firm"], ["firm_signature", "firm_authority", "attendance_source"]),
    T("consultation.declined", ["requested", "options_offered", "proposed", "reschedule_requested"], "declined", ["firm"], ["firm_signature", "firm_authority"]),
    T("consultation.cancelled", ["requested", "options_offered", "proposed", "confirmed", "reschedule_requested"], "cancelled", ["firm", "consumer"], ["firm_signature_or_authenticated_user_action"]),
    T("consultation.expired", ["options_offered", "proposed"], "expired", ["lifecycle_host"], ["all_slots_in_past"]),
  ], ["Attendance is never inferred from a calendar end time. completed and no_show need a firm event that names its attendance source.",
      "A new time after reschedule_requested is a new options_offered event with a higher version; the old confirmation stays in history."]),

  M("engagement", "engagement", "not_offered", {
    not_offered: S("The organization has not offered an engagement."),
    offered: S("The organization issued a signed, versioned engagement offer with hashed documents."),
    user_reviewing: S("The user opened the exact offer on the approval surface."),
    user_accepted: S("The user accepted this exact offer version on the approval surface. The organization has not confirmed."),
    user_declined: S("The user declined this offer version."),
    firm_confirmed: S("Firm reports engagement confirmed (source and time shown). OLIP does not create or guarantee an attorney-client relationship; when one is formed is a question of law."),
    rejected_by_firm: S("After the user accepted, the organization decided not to confirm.", true),
    withdrawn: S("The organization withdrew the offer.", true),
    expired: S("The offer's validity window ended before acceptance.", true),
    ended: S("The organization reports the engagement ended (see the matter record).", true),
  }, [
    T("engagement.offered", ["not_offered", "offered", "user_reviewing", "user_accepted", "user_declined"], "offered", ["firm"], ["firm_signature", "firm_authority", "offer_digest", "document_sha256"], "A new version invalidates any earlier acceptance."),
    T("engagement.user_reviewing", "offered", "user_reviewing", ["lifecycle_host"], ["authenticated_user_view"]),
    T("engagement.user_accepted", ["offered", "user_reviewing"], "user_accepted", ["consumer"], ["authenticated_user_action", "offer_digest"]),
    T("engagement.user_declined", ["offered", "user_reviewing"], "user_declined", ["consumer"], ["authenticated_user_action", "offer_digest"]),
    T("engagement.firm_confirmed", "user_accepted", "firm_confirmed", ["firm"], ["firm_signature", "firm_authority", "offer_digest", "acceptance_id"]),
    T("engagement.rejected_by_firm", "user_accepted", "rejected_by_firm", ["firm"], ["firm_signature", "firm_authority"]),
    T("engagement.withdrawn", ["offered", "user_reviewing", "user_accepted"], "withdrawn", ["firm"], ["firm_signature", "firm_authority"]),
    T("engagement.expired", ["offered", "user_reviewing"], "expired", ["lifecycle_host"], ["offer_valid_until_passed"]),
    T("engagement.ended", "firm_confirmed", "ended", ["firm"], ["firm_signature", "firm_authority"]),
  ], ["engagement.payment_reported is recorded as information only and NEVER changes state. Payment never creates firm_confirmed.",
      "Only a firm event signed by a key bound to the organization, by an actor whose role allows engagement.firm_confirmed, produces firm_confirmed."]),

  M("message_delivery", "message", "draft", {
    draft: S("Prepared, not sent. An agent may draft."),
    user_authorized: S("The user approved this exact text, recipient and attachments."),
    queued: S("The host accepted it for sending."),
    accepted_by_transport: S("A relay or transport accepted it. This is NOT delivery."),
    delivered_to_endpoint: S("The recipient's own system signed a receipt for this exact content. Not read."),
    read_by_recipient: S("An authorized recipient participant recorded reading it. Optional; never inferred.", true),
    failed: S("Sending failed.", true),
    cancelled_before_send: S("Cancelled before it left the host.", true),
    expired: S("The approval or draft expired before sending.", true),
  }, [
    T("message.user_authorized", "draft", "user_authorized", ["consumer"], ["user_disclosure_grant"]),
    T("message.queued", ["user_authorized"], "queued", ["lifecycle_host"], []),
    T("message.accepted_by_transport", "queued", "accepted_by_transport", ["lifecycle_host"], ["transport_acknowledgement"]),
    T("message.delivered_to_endpoint", "accepted_by_transport", "delivered_to_endpoint", ["lifecycle_host"], ["recipient_signed_receipt"]),
    T("message.read_by_recipient", "delivered_to_endpoint", "read_by_recipient", ["firm", "consumer"], ["firm_signature_or_authenticated_user_action"]),
    T("message.failed", ["queued", "accepted_by_transport"], "failed", ["lifecycle_host"], []),
    T("message.cancelled_before_send", ["draft", "user_authorized", "queued"], "cancelled_before_send", ["consumer"], ["authenticated_user_action"]),
    T("message.expired", ["draft", "user_authorized"], "expired", ["lifecycle_host"], []),
  ], ["A reply is a NEW message, never a state of the earlier one.", "Firm-origin messages start at queued after the host verifies the firm signature; consumer-origin messages need user_authorized first.",
      "Without a cryptographically bound recipient receipt the state stays accepted_by_transport."]),

  M("matter", "matter", "open", {
    open: S("The matter record exists."),
    inactive: S("The engaged organization marked the matter inactive."),
    closure_proposed: S("The engaged organization proposed closing the matter and gave notice."),
    closed: S("Closed. For a represented matter only the organization can close it. An unrepresented user may close their own intake journey.", true),
    terminated: S("The engaged organization reports the representation was terminated.", true),
  }, [
    T("matter.inactive", "open", "inactive", ["firm"], ["firm_signature", "firm_authority", "represented_by_signer"]),
    T("matter.reactivated", "inactive", "open", ["firm"], ["firm_signature", "firm_authority", "represented_by_signer"]),
    T("matter.closure_proposed", ["open", "inactive"], "closure_proposed", ["firm"], ["firm_signature", "firm_authority", "represented_by_signer", "notice_text"]),
    T("matter.closed", ["open", "inactive", "closure_proposed"], "closed", ["firm", "consumer"], ["firm_signature_if_represented", "authenticated_user_action_if_not_represented"]),
    T("matter.terminated", ["open", "inactive", "closure_proposed"], "terminated", ["firm"], ["firm_signature", "firm_authority", "represented_by_signer", "notice_text"]),
  ], ["Reopening creates a new matter that references the old one (reopens). Closed and terminated matters never change again.",
      "A user closing their own journey on an unrepresented matter is recorded with closed_by consumer and is never shown as a firm termination."]),
];
for (const m of machines) fs.writeFileSync(new URL(`${m.machine}.json`, out), JSON.stringify(m, null, 2) + "\n");
const invariants = { olip_version: V, status: "proposed_draft_not_adopted", invariants: [
  { id: "INV-01", text: "No engagement.firm_confirmed from agent_client, lifecycle_host or consumer roles.", tests: ["security: agent cannot create firm events", "security: host key cannot sign firm events", "security: paralegal cannot confirm engagement"] },
  { id: "INV-02", text: "No consultation.confirmed without a firm-signed event that names a confirmation reference and matches the user's proposed slot.", tests: ["consultation: confirm needs firm event", "consultation: confirm with wrong slot rejected"] },
  { id: "INV-03", text: "The OLIP 1.0 handoff machine is unchanged; no 2.0 state is ever written into a 1.0 handoff.", tests: ["compat: 1.0 states unchanged"] },
  { id: "INV-04", text: "No user-visible firm reply is created from a transport or email notification; replies are firm-signed messages.", tests: ["messages: transport ack is not delivery"] },
  { id: "INV-05", text: "No consumer messages to an organization after the matter is closed or terminated, except a new authorized thread; firm closing communications are allowed.", tests: ["matter: thread read-only after termination"] },
  { id: "INV-06", text: "Late, duplicate, replayed or out-of-order events never advance a projection illegally; duplicates are idempotent.", tests: ["events: replay", "events: stale", "events: stale revision"] },
  { id: "INV-07", text: "Two validly signed contradictory events for the same object revision produce a flagged reconciliation record, never a silent choice.", tests: ["events: contradictory events flagged"] },
  { id: "INV-08", text: "Each disclosure needs its own user grant bound to recipient, purpose, exact fields or content digest, revision, notice version, nonce and expiry. Grants never carry across recipients or passports.", tests: ["consent: grant reuse for other firm", "consent: edit after approval", "scenario C"] },
  { id: "INV-09", text: "A full CaseBrief may be disclosed to an organization only after that organization's conflict screen is eligible_for_further_intake.", tests: ["intake: casebrief before eligibility"] },
  { id: "INV-10", text: "Attendance, delivery and reading are never inferred from time passing or transport acceptance.", tests: ["consultation: time passing", "messages: offline relay"] },
] };
fs.writeFileSync(new URL("invariants.json", out), JSON.stringify(invariants, null, 2) + "\n");
console.log("wrote", machines.length, "machines + invariants");
