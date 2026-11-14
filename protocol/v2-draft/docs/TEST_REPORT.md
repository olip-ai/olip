# Test report

Run date: 2026-11-14. Environment: Linux, Node v22.23.4, Python 3.13. All data is fictional, and every result is from reference code run by its own authors. Nothing here is an independent result.

## Before and after

| Suite | Command | Before (base `a71837b`) | After |
|---|---|---|---|
| OLIP 1.0 protocol | `(cd protocol && npm test)` | 24 / 24 pass | 24 / 24 pass |
| Website | `npm test` | 25 / 25 pass | 25 / 25 pass |
| Publication scan | `npm run scan` | 0 findings | 0 findings |
| OLIP 2.0-draft | `(cd protocol/v2-draft && npm test)` | did not exist | **97 / 97 pass, 0 skipped, about 9 s** |
| 2.0 demo | `npm run demo` | did not exist | Scenario A completes in both topologies |
| 2.0 conformance | `npm run conformance` | did not exist | relay 17/1/2/0, direct 17/1/2/0, compat 18/0/2/0, production 10/10/0/0 (pass/skip/mock_only/fail) |
| Frozen 1.0 files | `tests/compat.test.mjs` | 45 / 45 match | 45 / 45 match |
| Dependency audit | `npm audit` (v2-draft) | n/a | 0 vulnerabilities |

## 2.0-draft tests by file

| File | Tests | Covers |
|---|---|---|
| `consent.test.mjs` | 14 | Agent cannot approve, code never returned, lockout after 3 tries, cross-user 404, digest mismatch, edit after approval, one recipient and one use, expiry, field allowlist, conflict-stage gate, additional-screening scope, prompt injection, content access and revocation, decline and revoke, approval page accessibility |
| `consultation-engagement.test.mjs` | 10 | Zoned times and DST, slot validation, firm-only confirmation of the exact slot, no inferred attendance, expiry and reschedule, offer document clearance, offer version changes, payment never confirms, distinct decline, withdrawal and expiry outcomes |
| `firm-authority.test.mjs` | 9 | No firm events from agents or users, host key refused, staff role checks at the firm and the host, cross-firm 404, replay, stale and out-of-order events, contradictions flagged, revoked staff, key rotation, revocation and compromise, delegated software scope |
| `messages-documents.test.mjs` | 8 | Per-message approval, transport is not delivery, firm signing and AI-drafting labels, observers, logistics pre-authorization, document checks, short-lived inert downloads, closure rules |
| `tenancy-ops.test.mjs` | 10 | Cross-tenant 404, idempotency, rate limits, policy gate, log redaction, encryption at rest, journal chain, webhooks (including a changed `kid`), SSRF and DNS rebinding, pagination |
| `e2e.test.mjs` | 6 | Scenario A (relay and direct), B (firm declines), C (passport and new firm), D (malicious assistant), E (firm offline) |
| `compat.test.mjs` | 6 | Freeze list, 45 hashes, folder separation, 1.0 machine untouched, 1.0 conformance on the combined host, downgrade (Node and Python), 1.0 client view |
| `machines.test.mjs` | 5 | Structure, reachability, terminal states, exhaustive transition table, authority invariants, random walks (5,000 steps per machine) |
| `schemas.test.mjs` | 7 | Generator drift, strict compile, examples, machines, error registry, live response validation, a tampered object is caught |
| `openapi.test.mjs` | 4 | Generator drift, OpenAPI 3.1 shape, `$ref` targets, every request body in a full journey matches its schema |
| `mcp.test.mjs` | 5 | Negotiation and safe tool list, URL elicitation is not approval, decline path, full journey to firm confirmation, stdio process |
| `a2a.test.mjs` | 5 | Agent Card, read operation, AUTH_REQUIRED approval path, rejected operations with stable codes, required extension enforced |
| `vectors-python.test.mjs` | 5 | Vector drift, Python reproduces every vector, Python journey, Python against a 1.0-only host, TypeScript WebCrypto reproduces the vectors |
| `conformance.test.mjs` | 3 | Relay and direct targets, combined 1.0 + 2.0 target, production build |
| **Total** | **97** | |

In addition, every test's HTTP traffic is checked against the published JSON Schemas as it runs (`tests/helpers.mjs`). A schema mismatch anywhere fails the test that caused it.

## Python independent check

`python3 sdk/python/check_vectors.py` gives 34 checks and 0 failures. The Python code was written separately from the JavaScript code and uses only the standard library. It falls back to the repository's pure-Python Ed25519 when `cryptography` is missing. The same people wrote both, so this is a cross-language check, not an independent implementation.

## What the tests do not show

- No independent implementer has run the conformance suite.
- No external security review or penetration test.
- No load, soak or failover testing; the reference host keeps everything in memory.
- Accessibility is checked by one automated test only, with no manual WCAG review.
- The Node 20 CI job runs but is informational; it has not yet been observed passing in CI.
- The approval code channel, the malware scan and payment are mocks.
- No real email, calendar, payment or messaging system was contacted.
