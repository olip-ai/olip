// OLIP 3.0-draft HTTPS route table (also the source of the OpenAPI document). PROPOSED, NOT ADOPTED.
// [method, path template, action id, how to build the input]
export const ROUTES = [
  ["GET", "/olip/v3/agent-manifest", "olip.get_capabilities", () => ({})],
  ["GET", "/.well-known/olip-agent.json", "olip.get_capabilities", () => ({})],
  ["GET", "/olip/v3/professionals", "olip.find_professionals", (p, b, q) => pick(q, ["jurisdiction", "matter_type"])],
  ["GET", "/olip/v3/recipients/{organization_id}/policy", "olip.get_recipient_policy", (p, b, q) => ({ organization_id: p.organization_id, ...pick(q, ["stage"]) })],
  ["POST", "/olip/v3/casebriefs/check", "olip.prepare_casebrief", (p, b) => b],
  ["POST", "/olip/v3/workflows", "olip.start_workflow", (p, b) => b],
  ["GET", "/olip/v3/workflows/{workflow_id}", "olip.get_workflow", (p) => ({ workflow_id: p.workflow_id })],
  ["GET", "/olip/v3/workflows/{workflow_id}/events", "olip.list_workflow_events", (p, b, q) => ({ workflow_id: p.workflow_id, ...pick(q, ["cursor", "last_seen_digest"]), ...(q.get("limit") ? { limit: Number(q.get("limit")) } : {}) })],
  ["POST", "/olip/v3/workflows/{workflow_id}/cancel", "olip.cancel_pending_request", (p, b) => b],
  ["POST", "/olip/v3/disclosures/preview", "olip.preview_disclosure", (p, b) => b],
  ["POST", "/olip/v3/disclosures/submit", "olip.submit_approved_disclosure", (p, b) => b],
  ["POST", "/olip/v3/actions/plan-next", "olip.plan_next_actions", (p, b) => b],
  ["POST", "/olip/v3/capsules/export", "olip.export_context_capsule", (p, b) => b],
  ["POST", "/olip/v3/capsules/validate", "olip.validate_context_capsule", (p, b) => b],
  ["POST", "/olip/v3/capsules/import-authorizations", "olip.authorize_capsule_import", (p, b) => b],
  ["POST", "/olip/v3/capsules/import", "olip.import_context_capsule", (p, b) => b],
  ["GET", "/olip/v3/capsules/{capsule_id}", "olip.get_imported_capsule", (p) => ({ capsule_id: p.capsule_id })],
  ["POST", "/olip/v3/capsules/{capsule_id}/revoke", "olip.revoke_context_capsule", (p) => ({ capsule_id: p.capsule_id })],
  ["POST", "/olip/v3/subscriptions", "olip.subscribe_events", (p, b) => b],
  ["DELETE", "/olip/v3/subscriptions/{subscription_id}", "olip.cancel_subscription", (p) => ({ subscription_id: p.subscription_id })],
  ["POST", "/olip/v3/lifecycle", "olip.call_lifecycle", (p, b) => b],
  ["POST", "/olip/v3/firm-events", "olip.record_firm_event", (p, b) => b],
  ["POST", "/olip/v3/admin/jurisdiction-policy", "olip.set_jurisdiction_policy", (p, b) => b],
  ["POST", "/olip/v3/actions/{action_id}/invoke", null, (p, b) => b],
].map(([method, path, actionId, input]) => ({ method, path, actionId, input, re: new RegExp("^" + path.replace(/\{[^}]+\}/g, "([^/]+)") + "$"), keys: [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]) }));
const pick = (q, ks) => Object.fromEntries(ks.filter((k) => q.get(k) != null).map((k) => [k, q.get(k)]));

