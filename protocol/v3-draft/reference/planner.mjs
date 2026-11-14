// OLIP 3.0-draft Next Actions Planner. PROPOSED, NOT ADOPTED.
// A pure, deterministic function of server-side state: the same inputs always give byte-identical output.
// It lists PROCEDURAL next steps so an unfamiliar assistant can follow the workflow. It never:
//   * decides legal merits, deadlines or which lawyer to choose,
//   * creates the permission it describes ("allowed" is a hint; the gateway rechecks the real state at execution),
//   * uses a model. Any plain-language rewording by a client must not change dispositions.
import { V3, digestOf } from "./lib/core.mjs";

export const DISPOSITIONS = ["allowed_read_only", "allowed", "requires_user_approval", "requires_firm_authority", "blocked"];
const ORDER = ["olip.get_workflow", "olip.list_workflow_events", "olip.find_professionals", "olip.get_recipient_policy", "olip.preview_disclosure", "olip.submit_approved_disclosure", "olip.call_lifecycle", "olip.record_firm_event", "olip.export_context_capsule"];
const GOAL_FOCUS = {
  find_counsel: ["olip.find_professionals", "olip.get_recipient_policy", "olip.preview_disclosure"],
  share_screening: ["olip.preview_disclosure", "olip.submit_approved_disclosure"],
  share_casebrief: ["olip.preview_disclosure", "olip.submit_approved_disclosure"],
  schedule_consultation: ["olip.call_lifecycle"], review_engagement: ["olip.call_lifecycle"], message_firm: ["olip.call_lifecycle"],
  move_to_another_assistant: ["olip.export_context_capsule"], close_out: ["olip.export_context_capsule", "olip.get_workflow"],
};

// state: { workflow_id, head: {sequence, digest}, principal_kind, lifecycle: 2.0 status projection, disclosures: [...], grantState(grant_id),
//          writeGate(effect) -> null | reason_code, policy_version, goal }
export function planNextActions(state) {
  const out = [];
  const add = (action, disposition, reason_code, extra = {}) => out.push({ action, ...(extra.operation ? { operation: extra.operation } : {}), ...(extra.target ? { target: extra.target } : {}), disposition, reason_code, missing_preconditions: [...(extra.missing || [])].sort() });
  const writeBlock = (effect) => state.writeGate(effect);
  const consumer = state.principal_kind === "user" || state.principal_kind === "agent";
  const L = state.lifecycle;
  const matterState = L.matter.state;
  const closed = matterState === "closed" || matterState === "terminated";

  add("olip.get_workflow", "allowed_read_only", "STATUS_OF_RECORD");
  add("olip.list_workflow_events", "allowed_read_only", "EVENT_HISTORY");

  // gate(): disposition for a step that writes, discloses or needs the user; null means "no extra block".
  const gate = (effect) => { const r = writeBlock(effect); return r ? { disposition: "blocked", reason_code: r } : null; };
  const userStep = (action, reason, missing, target, operation, effect = "external_disclosure") => {
    const g = closed ? { disposition: "blocked", reason_code: "MATTER_CLOSED" } : gate(effect);
    add(action, g ? g.disposition : "requires_user_approval", g ? g.reason_code : reason, { target, operation, missing: g ? [] : missing });
  };
  const firmStep = (reason, target, operation) => add("olip.record_firm_event", "requires_firm_authority", reason, { target, operation, missing: ["authenticated_firm_system", "firm_signed_event"] });

  const screens = L.conflict_screens || [];
  const byOrgScreen = new Map(); for (const s of screens) byOrgScreen.set(s.organization_id, s); // latest per organization
  if (!closed) {
    add("olip.find_professionals", "allowed_read_only", screens.length ? "OTHER_ORGANIZATIONS_MAY_BE_LISTED" : "NO_RECIPIENT_CHOSEN_YET");
    if (!screens.length) userStep("olip.preview_disclosure", "SCREENING_NEEDS_USER_APPROVAL", ["user_selected_recipient", "user_approval_on_approval_page"], undefined, undefined, "local_preparation");
  }

  // Prepared but not yet sent disclosures.
  for (const d of [...state.disclosures].sort((a, b) => (a.disclosure_id < b.disclosure_id ? -1 : 1))) {
    if (d.state !== "awaiting_user_approval") continue;
    const target = { organization_id: d.organization_id, disclosure_id: d.disclosure_id, stage: d.stage };
    const gs = state.grantState(d.approval.grant_id);
    const g = closed ? { disposition: "blocked", reason_code: "MATTER_CLOSED" } : gate("external_disclosure");
    if (g) add("olip.submit_approved_disclosure", g.disposition, g.reason_code, { target });
    else if (gs === "active") add("olip.submit_approved_disclosure", "allowed", "USER_APPROVAL_RECORDED_RECHECKED_AT_EXECUTION", { target });
    else if (gs === "pending") add("olip.submit_approved_disclosure", "requires_user_approval", "WAITING_FOR_USER_DECISION", { target, missing: ["user_decision_on_approval_page"] });
    else add("olip.submit_approved_disclosure", "blocked", gs === "revoked" ? "GRANT_REVOKED" : gs === "denied" ? "USER_DECLINED" : "GRANT_EXPIRED", { target, missing: ["new_user_approval"] });
  }

  for (const [org, s] of [...byOrgScreen.entries()].sort()) {
    const target = { organization_id: org, object_id: s.id };
    if (s.state === "screening_requested") firmStep("WAITING_FOR_FIRM_SCREENING_RESPONSE", target, "intake.eligible_for_further_intake|intake.information_requested|intake.unable_to_proceed");
    if (s.state === "information_requested") userStep("olip.call_lifecycle", "FIRM_ASKED_FOR_MORE_SCREENING_DETAIL", ["user_approval_on_approval_page"], target, "provide_additional_screening (2.0-draft route)");
    if (s.state === "unable_to_proceed") add("olip.preview_disclosure", "blocked", "FIRM_SAID_IT_CANNOT_CONTINUE", { target });
    if (s.state === "eligible_for_further_intake") {
      const sent = state.disclosures.some((d) => d.organization_id === org && d.stage === "casebrief" && d.state === "submitted");
      if (!sent) userStep("olip.preview_disclosure", "CASEBRIEF_NEEDS_SEPARATE_USER_APPROVAL", ["fresh_user_content_digest_grant"], { ...target, stage: "casebrief" }, undefined, "local_preparation");
      const consults = (L.consultations || []).filter((c) => c.organization_id === org);
      if (!consults.length) userStep("olip.call_lifecycle", "CONSULTATION_REQUEST_NEEDS_USER_APPROVAL", ["user_approval_on_approval_page"], target, "request_consultation");
    }
  }
  for (const c of [...(L.consultations || [])].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const target = { organization_id: c.organization_id, object_id: c.id };
    if (c.state === "not_requested") userStep("olip.call_lifecycle", "CONSULTATION_REQUEST_AWAITS_USER", ["user_approval_on_approval_page"], target, "submit_consultation_request");
    if (c.state === "requested" || c.state === "reschedule_requested") firmStep("WAITING_FOR_FIRM_TIMES", target, "consultation.options_offered");
    if (c.state === "options_offered") userStep("olip.call_lifecycle", "PICK_A_FIRM_OFFERED_TIME", ["user_approval_on_approval_page"], target, "propose_consultation_slot");
    if (c.state === "proposed") firmStep("WAITING_FOR_FIRM_CONFIRMATION", target, "consultation.confirmed");
    if (c.state === "confirmed") firmStep("ATTENDANCE_IS_REPORTED_BY_THE_FIRM_ONLY", target, "consultation.completed|consultation.no_show");
  }
  for (const e of [...(L.engagements || [])].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const target = { organization_id: e.organization_id, object_id: e.id };
    if (e.state === "offered" || e.state === "user_reviewing") userStep("olip.call_lifecycle", "ENGAGEMENT_OFFER_NEEDS_USER_DECISION", ["user_decision_on_approval_page"], target, "respond_to_engagement_offer");
    if (e.state === "user_accepted") firmStep("CLIENT_ACCEPTANCE_IS_NOT_FIRM_CONFIRMATION", target, "engagement.firm_confirmed");
    if (e.state === "firm_confirmed") userStep("olip.call_lifecycle", "MESSAGES_NEED_USER_APPROVAL_EACH_TIME", ["user_approval_on_approval_page"], target, "send_message");
  }
  add("olip.export_context_capsule", consumer && state.principal_kind === "user" ? "allowed" : "requires_user_approval", consumer && state.principal_kind === "user" ? "USER_MAY_EXPORT_OWN_CAPSULE" : "ONLY_THE_SIGNED_IN_USER_CAN_EXPORT", { missing: state.principal_kind === "user" ? [] : ["user_signed_in_session"] });

  // Deterministic order: goal focus first, then the fixed order, then target ids.
  const focus = GOAL_FOCUS[state.goal] || [];
  const rank = (a) => (focus.includes(a.action) ? focus.indexOf(a.action) : 100 + ORDER.indexOf(a.action));
  const key = (a) => JSON.stringify([a.target?.organization_id ?? "", a.target?.object_id ?? a.target?.disclosure_id ?? "", a.operation ?? ""]);
  out.sort((a, b) => rank(a) - rank(b) || (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const plan = { olip_version: V3, plan_version: V3, workflow_id: state.workflow_id, as_of_event_sequence: state.head.sequence, as_of_event_digest: state.head.digest, desired_goal: state.goal ?? null,
    next_actions: out, policy_version: state.policy_version, not_authorization: true, not_legal_advice: true,
    statement: "Procedural hints only. 'allowed' is not permission: every action is checked again by the host when it is called. Nothing here is legal advice or a recommendation of any organization." };
  plan.plan_digest = digestOf(plan);
  return plan;
}
