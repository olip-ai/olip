// OLIP 3.0-draft error catalog: one stable code per meaning, with its HTTP status, MCP and A2A mappings.
// Error bodies never reveal whether a hidden object exists (404 masking) and never carry secrets or case content.
// The same table generates docs/ERROR_CATALOG.md and the error schema enum, so they cannot drift.
import { V3 } from "./core.mjs";

// [code, http, retryable, a2a task state, meaning]
const ROWS = [
  ["VERSION_UNSUPPORTED", 400, false, "TASK_STATE_REJECTED", "The requested OLIP version or profile is not offered here. Read the manifest and pick a listed version."],
  ["ACTION_NOT_SUPPORTED", 404, false, "TASK_STATE_REJECTED", "No such action, or not available through this binding."],
  ["SCHEMA_INVALID", 400, false, "TASK_STATE_REJECTED", "The input does not match the action's input schema."],
  ["AUTH_REQUIRED", 401, false, "TASK_STATE_AUTH_REQUIRED", "A valid bearer token is required."],
  ["SCOPE_INSUFFICIENT", 403, false, "TASK_STATE_REJECTED", "The caller is authenticated but this kind of principal may not perform this action."],
  ["USER_APPROVAL_REQUIRED", 403, false, "TASK_STATE_AUTH_REQUIRED", "This needs the user's own approval on the approval page. An assistant cannot give it."],
  ["GRANT_EXPIRED", 410, false, "TASK_STATE_AUTH_REQUIRED", "The approval, import authorization or capsule has expired or was already used. Ask the user again."],
  ["GRANT_REVOKED", 403, false, "TASK_STATE_REJECTED", "The user revoked this approval or authorization."],
  ["DIGEST_MISMATCH", 409, false, "TASK_STATE_AUTH_REQUIRED", "The content changed after the user approved it, or the digest sent does not match."],
  ["RECIPIENT_MISMATCH", 403, false, "TASK_STATE_REJECTED", "The approval names a different recipient, matter or action."],
  ["FIRM_AUTHORITY_REQUIRED", 403, false, "TASK_STATE_REJECTED", "Only the organization's own authenticated, authorized system can do this."],
  ["POLICY_UNREVIEWED", 422, false, "TASK_STATE_REJECTED", "No counsel-approved policy exists for this jurisdiction. Regulated writes fail closed."],
  ["POLICY_STALE", 422, false, "TASK_STATE_REJECTED", "The policy for this jurisdiction is past its review date. Regulated writes fail closed."],
  ["PRECONDITION_MISSING", 409, false, "TASK_STATE_REJECTED", "An earlier step must happen first (for example, the firm must say intake may continue)."],
  ["CONFLICTING_STATE", 409, false, "TASK_STATE_FAILED", "The object changed or is in a state that does not allow this. Read it again."],
  ["IDEMPOTENCY_CONFLICT", 409, false, "TASK_STATE_REJECTED", "This Idempotency-Key was already used with a different request."],
  ["IDEMPOTENCY_KEY_REQUIRED", 400, false, "TASK_STATE_REJECTED", "Mutating actions need an Idempotency-Key."],
  ["REPLAY_DETECTED", 409, false, "TASK_STATE_REJECTED", "This signed object, nonce or webhook was already used."],
  ["EVENT_CURSOR_GAP", 409, false, "TASK_STATE_FAILED", "The cursor or last-seen digest does not match the journal. Restart from the last verified cursor."],
  ["SUBSCRIPTION_REVOKED", 410, false, "TASK_STATE_REJECTED", "The subscription was cancelled or revoked."],
  ["CALLBACK_URL_REJECTED", 422, false, "TASK_STATE_REJECTED", "The callback URL failed the outbound-request safety checks."],
  ["RECIPIENT_UNREACHABLE", 502, true, "TASK_STATE_FAILED", "The recipient organization's endpoint could not be reached."],
  ["TRANSIENT_BACKEND_ERROR", 503, true, "TASK_STATE_FAILED", "A temporary error. Retry with the same Idempotency-Key."],
  ["UNVERIFIED_EVIDENCE", 422, false, "TASK_STATE_REJECTED", "A signature, digest or provenance claim did not verify."],
  ["CAPSULE_INVALID", 422, false, "TASK_STATE_REJECTED", "The context capsule failed its signature, digest, schema or expiry check."],
  ["SENSITIVE_DATA_BLOCKED", 422, false, "TASK_STATE_REJECTED", "Some content is not allowed at this stage (for example a Social Security number in screening)."],
  ["RATE_LIMITED", 429, true, "TASK_STATE_FAILED", "Too many requests. Retry later."],
  ["SECURITY_REVIEW_REQUIRED", 422, false, "TASK_STATE_REJECTED", "Production use of this feature is blocked until an independent security review is recorded."],
  ["NOT_FOUND", 404, false, "TASK_STATE_REJECTED", "Not found, or not visible to this caller."],
  ["INTERNAL", 500, true, "TASK_STATE_FAILED", "Internal error in the reference host."],
];
export const ERRORS = Object.fromEntries(ROWS.map(([code, http, retryable, a2a, meaning]) => [code, { code, http, retryable, a2a_task_state: a2a, mcp: "tool_result_isError", meaning }]));
export const ERROR_CODES = ROWS.map((r) => r[0]);

export class OlipV3Error extends Error {
  constructor(code, message, details) { super(message || ERRORS[code]?.meaning || code); this.code = ERRORS[code] ? code : "INTERNAL"; this.details = details; }
}
export const fail = (code, message, details) => { throw new OlipV3Error(code, message, details); };
export function errorBody(code, message, { correlation_id, details } = {}) {
  const e = ERRORS[code] || ERRORS.INTERNAL;
  return { olip_version: V3, error: { code: e.code, message: message || e.meaning, retryable: e.retryable, ...(details ? { details } : {}) }, correlation_id: correlation_id ?? null };
}

// How the unchanged 2.0-draft lifecycle host's error codes read in 3.0 terms. The 2.0 code is kept alongside.
const FROM_V2 = {
  OLIP_NOT_FOUND: "NOT_FOUND", OLIP_UNAUTHENTICATED: "AUTH_REQUIRED", OLIP_TOKEN_EXPIRED: "AUTH_REQUIRED", OLIP_DELEGATION_REVOKED: "GRANT_REVOKED",
  OLIP_RATE_LIMITED: "RATE_LIMITED", OLIP_FORBIDDEN: "SCOPE_INSUFFICIENT", OLIP_AGENT_CANNOT_APPROVE: "USER_APPROVAL_REQUIRED",
  OLIP_DISCLOSURE_NOT_AUTHORIZED: "USER_APPROVAL_REQUIRED", OLIP_AUTHORIZATION_EXPIRED: "GRANT_EXPIRED", OLIP_CONSENT_DIGEST_MISMATCH: "DIGEST_MISMATCH",
  OLIP_FIRM_AUTHORITY_REQUIRED: "FIRM_AUTHORITY_REQUIRED", OLIP_POLICY_GATE_CLOSED: "POLICY_UNREVIEWED", OLIP_SCHEMA_INVALID: "SCHEMA_INVALID",
  OLIP_INVALID_REQUEST: "SCHEMA_INVALID", OLIP_FIELD_NOT_ALLOWED: "SCHEMA_INVALID", OLIP_SENSITIVE_DATA_BLOCKED: "SENSITIVE_DATA_BLOCKED",
  OLIP_IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT", OLIP_IDEMPOTENCY_KEY_REQUIRED: "IDEMPOTENCY_KEY_REQUIRED", OLIP_EVENT_REPLAYED: "REPLAY_DETECTED",
  OLIP_EVENT_SIGNATURE_INVALID: "UNVERIFIED_EVIDENCE", OLIP_KEY_REVOKED: "UNVERIFIED_EVIDENCE", OLIP_EVENT_STALE: "UNVERIFIED_EVIDENCE",
  OLIP_REVISION_CONFLICT: "CONFLICTING_STATE", OLIP_EVENT_CONFLICT: "CONFLICTING_STATE", OLIP_LIFECYCLE_TRANSITION_INVALID: "CONFLICTING_STATE",
  OLIP_CONFLICT_STAGE_REQUIRED: "PRECONDITION_MISSING", OLIP_THREAD_MEMBERSHIP_REQUIRED: "PRECONDITION_MISSING", OLIP_DOCUMENT_NOT_CLEARED: "PRECONDITION_MISSING",
  OLIP_RECIPIENT_NOT_USER_SELECTED: "RECIPIENT_MISMATCH", OLIP_ENGAGEMENT_OFFER_CHANGED: "DIGEST_MISMATCH", OLIP_ENGAGEMENT_OFFER_EXPIRED: "GRANT_EXPIRED",
  OLIP_THREAD_CLOSED: "CONFLICTING_STATE", OLIP_CONSULTATION_SLOT_EXPIRED: "CONFLICTING_STATE", OLIP_CONSULTATION_SLOT_MISMATCH: "CONFLICTING_STATE", OLIP_REVISION_REQUIRED: "PRECONDITION_MISSING",
  OLIP_PAYLOAD_TOO_LARGE: "SCHEMA_INVALID", OLIP_DOCUMENT_REJECTED: "SCHEMA_INVALID", OLIP_ATTENDANCE_SOURCE_REQUIRED: "UNVERIFIED_EVIDENCE", OLIP_CALLBACK_URL_REJECTED: "CALLBACK_URL_REJECTED",
  OLIP_PASSPORT_INVALID: "UNVERIFIED_EVIDENCE", OLIP_INTERNAL: "TRANSIENT_BACKEND_ERROR",
};
export function fromV2(status, body) {
  const v2code = body?.error?.code || "OLIP_INTERNAL";
  let code = FROM_V2[v2code];
  if (!code) code = status >= 500 ? "TRANSIENT_BACKEND_ERROR" : status === 404 ? "NOT_FOUND" : status === 409 ? "CONFLICTING_STATE" : status === 403 ? "SCOPE_INSUFFICIENT" : "SCHEMA_INVALID";
  return new OlipV3Error(code, body?.error?.message, { lifecycle_v2_code: v2code, ...(body?.error?.details ? { lifecycle_v2_details: body.error.details } : {}) });
}
