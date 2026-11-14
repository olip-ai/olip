// OLIP 3.0-draft Policy Decision Point (PDP). PROPOSED, NOT ADOPTED.
// One function, shared by every binding (HTTPS, MCP, A2A). It decides from server-side state only:
// the authenticated principal, the action's strictest effect, the jurisdiction policy, and (for disclosures)
// the user's recorded approval. Inputs from the caller (tool hints, flags, descriptions) never change the outcome.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { V3 } from "./lib/core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
export const BASE_POLICY = JSON.parse(readFileSync(join(here, "..", "policy", "policy-set.json"), "utf8"));
const WRITE_EFFECTS = new Set(["authorized_state_change", "external_disclosure", "firm_authoritative"]);

export function createPolicy({ mode = "mock", clock, overrides } = {}) {
  const P = structuredClone(BASE_POLICY);
  let version = 1;
  if (overrides) Object.assign(P.jurisdictions, structuredClone(overrides));
  const policyVersion = () => `${P.policy_set_id}#${version}`;
  const nowMs = () => clock.now().getTime();

  function jurisdictionRule(j) {
    const r = P.jurisdictions[j];
    if (!r) return { status: "unknown", known: false };
    return { ...r, known: true };
  }
  // Fail closed: unknown jurisdictions always; unreviewed or stale ones in production; suspended ones everywhere.
  function jurisdictionGate(j, effect) {
    if (!WRITE_EFFECTS.has(effect)) return null;
    const r = jurisdictionRule(j);
    if (!r.known) return { decision: "unknown_policy", reason_code: "POLICY_UNREVIEWED", detail: { jurisdiction: j ?? null, rule_status: "unknown" } };
    if (r.status === "suspended") return { decision: "deny", reason_code: "POLICY_UNREVIEWED", detail: { jurisdiction: j, rule_status: "suspended" } };
    if (r.review_by && Date.parse(r.review_by) < nowMs()) return { decision: "deny", reason_code: "POLICY_STALE", detail: { jurisdiction: j, review_by: r.review_by } };
    if (mode === "production" && r.status !== P.production_write_requires) return { decision: "unknown_policy", reason_code: "POLICY_UNREVIEWED", detail: { jurisdiction: j, rule_status: r.status } };
    return null;
  }

  // decide(): returns { decision, reason_code, missing, policy_version }. decision is one of
  // allow | require_user_approval | require_firm_authority | deny | unknown_policy.
  function decide({ principal, action, jurisdiction, fictional, approval }) {
    const base = { policy_version: policyVersion(), olip_version: V3 };
    const out = (decision, reason_code, missing = [], detail) => ({ ...base, decision, reason_code, missing, ...(detail ? { detail } : {}) });
    const kind = principal?.kind ?? "public";
    if (!action.principals.includes("public") && !principal) return out("deny", "AUTH_REQUIRED", ["bearer_token"]);
    if (!action.principals.includes("public") && !action.principals.includes(kind)) {
      if (action.effect === "firm_authoritative" || action.firm_authority) return out("require_firm_authority", "FIRM_AUTHORITY_REQUIRED", ["authenticated_firm_system", "firm_signed_event"]);
      if (action.principals.includes("user") && kind === "agent") return out("require_user_approval", "USER_APPROVAL_REQUIRED", ["user_signed_in_session"]);
      return out("deny", "SCOPE_INSUFFICIENT");
    }
    if (mode === "mock" && WRITE_EFFECTS.has(action.effect) && jurisdiction !== undefined && fictional === false) return out("deny", "POLICY_UNREVIEWED", [], { reason: "mock_mode_accepts_fictional_matters_only" });
    if (jurisdiction !== undefined) { const g = jurisdictionGate(jurisdiction, action.effect); if (g) return out(g.decision, g.reason_code, [], g.detail); }
    if (action.effect === "external_disclosure") {
      if (!approval) return out("require_user_approval", "USER_APPROVAL_REQUIRED", ["user_approval_on_approval_page"]);
      if (!approval.ok) return out(approval.decision || "deny", approval.reason_code, approval.missing || []);
    }
    return out("allow", "ALLOWED_BY_CURRENT_STATE");
  }

  function setJurisdiction(j, patch) { P.jurisdictions[j] = { ...(P.jurisdictions[j] || {}), ...patch }; version++; return { jurisdiction: j, rule: P.jurisdictions[j], policy_version: policyVersion() }; }
  function publicSummary() {
    return { policy_set_id: P.policy_set_id, policy_version: policyVersion(), status: P.status, statement: P.statement, production_write_requires: P.production_write_requires, mode,
      jurisdictions: Object.fromEntries(Object.entries(P.jurisdictions).map(([k, v]) => [k, { status: v.status, reviewed_at: v.reviewed_at ?? null, review_by: v.review_by ?? null }])),
      unknown_jurisdictions: "fail_closed", jurisdiction_approval: mode === "mock" ? "sandbox_only" : "per_jurisdiction" };
  }
  return { decide, jurisdictionGate, jurisdictionRule, setJurisdiction, publicSummary, policyVersion, get mode() { return mode; } };
}
