---
id: errors
title: Errors
description: OLIP structured errors - the error object, stable codes, HTTP status mapping, policy gate codes and allowed alternatives.
---

# Errors

Every OLIP error has the same shape ([`error.json`](pathname:///spec/0.1/schemas/error.json)):

```json
{
  "olip_version": "0.1",
  "error": {
    "code": "OLIP_POLICY_BLOCKED",
    "message": "Plain-language explanation.",
    "retryable": false,
    "details": {},
    "policy_gate": { "result": "blocked", "code": "mode_not_allowed", "rules_review_status": "pending_counsel_review" },
    "allowed_alternatives": [ { "kind": "contact_directly", "description": "…" } ]
  }
}
```

Codes are stable strings. New codes are only ever added, never repurposed.

## Codes and HTTP status

The spec's general rule (§8): 400 invalid, 401 unauthenticated or expired token, 403 forbidden, forged approval or wrong event source, 404 not found (also for other tenants' objects, so existence does not leak), 409 state conflict, 410 expired approval, 422 policy or field refusal, 428 missing idempotency key, 429 rate limit.

The table lists every code in the schema with the HTTP status the Node reference endpoint actually returns for it (read from its source). Where an implementation differs from the general rule, follow the rule and [report the difference](/community/#feedback).

| Code | HTTP status in the reference |
|---|---|
| `OLIP_INVALID_REQUEST` | 400 |
| `OLIP_VERSION_UNSUPPORTED` | 400 (with `supported_versions`) |
| `OLIP_UNAUTHENTICATED` | 401 |
| `OLIP_TOKEN_EXPIRED` | 401 |
| `OLIP_FORBIDDEN` | 403 |
| `OLIP_NOT_FOUND` | 404 |
| `OLIP_RATE_LIMITED` | 429 |
| `OLIP_PAYLOAD_TOO_LARGE` | 413 |
| `OLIP_INTERNAL` | 500 |
| `OLIP_ONE_RECIPIENT_ONLY` | 400 |
| `OLIP_POLICY_BLOCKED` | 422 |
| `OLIP_FIELD_NOT_ACCEPTED` | 422 |
| `OLIP_REQUIRED_FIELD_MISSING` | 422 |
| `OLIP_REVISION_CONFLICT` | 409 |
| `OLIP_IDEMPOTENCY_KEY_REQUIRED` | 428 |
| `OLIP_IDEMPOTENCY_KEY_REUSED` | 422 |
| `OLIP_AUTHORIZATION_INVALID` | 403 |
| `OLIP_AUTHORIZATION_REVOKED` | 409 |
| `OLIP_AUTHORIZATION_USED` | 409 |
| `OLIP_AUTHORIZATION_EXPIRED` | 410 |
| `OLIP_AUTHORIZATION_STALE` | 409 |
| `OLIP_CONSENT_MISMATCH` | 409 |
| `OLIP_NOT_APPROVED` | defined; not returned by the Node reference today |
| `OLIP_APPROVAL_CODE_WRONG` | 403 |
| `OLIP_APPROVAL_CODE_EXPIRED` | 410 |
| `OLIP_INVALID_TRANSITION` | 409 |
| `OLIP_EVENT_SOURCE_FORBIDDEN` | 403 |
| `OLIP_EVIDENCE_REQUIRED` | 400 |
| `OLIP_RECIPIENT_UNREACHABLE` | defined; not returned by the Node reference today |

**Delivery failure is not an HTTP error.** The submit succeeds and the handoff state is `queued` or `failed`.

## Policy gate codes (normative)

`jurisdiction_unknown`, `jurisdiction_not_supported`, `mode_unknown`, `mode_not_allowed`, `recipient_not_licensed_here`, `recipient_has_no_intake_endpoint`, `recipient_does_not_accept_mode`, `recipient_listing_agreement_missing`, `recipient_not_selected_by_user`, `recipient_does_not_list_matter`.

A blocked result MUST include at least one `allowed_alternatives` entry. Rule sets carry `rules_review_status` (`pending_counsel_review`, `counsel_approved`, `no_rules`); production write traffic MUST NOT run on rules that are not `counsel_approved` for that jurisdiction.

Fictional blocked example: [`13-error-policy-blocked.json`](pathname:///spec/0.1/examples/13-error-policy-blocked.json).
