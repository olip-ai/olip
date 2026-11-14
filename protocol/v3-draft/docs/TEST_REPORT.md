# Test report

Run on 2026-11-14 on the sponsor's build machine: Linux, Node 22.23.4, npm 10.9.9, Python 3.13.18 with `cryptography` 50.0.1. Pinned: `@modelcontextprotocol/sdk` 1.32.2, `@a2a-js/sdk` 1.3.0, `ajv` 8.20.0, `ajv-formats` 3.0.1, `express` 5.3.0, `typescript` 5.9.3. All data fictional; every server on 127.0.0.1. Nothing was run by an independent party.

## Results

| Suite | Command | Result |
|---|---|---|
| OLIP 3.0-draft | `cd protocol/v3-draft && npm test` | **70 / 70 pass**, 0 skip, about 26 s |
| 3.0-draft conformance, mock build | `npm run conformance` | 18 pass, 0 fail, 0 skip, 1 mock-only (V3-12 reads the fictional inbox) |
| 3.0-draft conformance, production build | `npm run conformance` | 9 pass, 0 fail (writes refused with `POLICY_UNREVIEWED`) |
| OLIP 2.0-draft (unchanged) | `cd protocol/v2-draft && npm test` | 97 / 97 pass |
| OLIP 1.0 (unchanged) | `cd protocol && npm test` | 24 / 24 pass (its rewritten results files were reverted, not committed) |
| Website | `npm test` (repository root) | 25 / 25 pass |
| Publication scan | `node scripts/scan-publication.mjs .` | 0 findings |
| Python vectors | `python3 -I sdk/python/check_vectors.py` | 9 checked, 0 failed, 0 skipped (8 checked and 1 skipped without `cryptography`) |

## What the 70 tests cover

| File | Tests | Covers |
|---|---|---|
| `contract.test.mjs` | 8 | Generated schemas, OpenAPI, examples and error catalog equal committed files; strict 2020-12 compile; manifest signature, etag, neutrality; served documents; malformed, oversized and unknown-field input; version header; 2.0 pass-through |
| `policy.test.mjs` | 6 | Decision matrix; unknown, suspended, stale and unreviewed jurisdictions; production fail-closed on a live host; mock fictional-only; operator-only policy changes; policy change between approval and send |
| `consent.test.mjs` | 9 | Agent self-approval refused; send before approval; decline; changed digest; another request's grant; CaseBrief edited after approval; revoked and expired grants; cancelled and already-sent requests; idempotent replay, conflict and per-caller key scope; 4 concurrent sends give 1 delivery; injected text stays data |
| `firm-tenancy.test.mjs` | 5 | Agents and users cannot record firm events through any binding; forged firm key, other firm and stale revision refused; cross-tenant NOT_FOUND on 8 actions; missing, invalid, expired tokens and revoked delegation; audit holds no content or tokens |
| `capsule.test.mjs` | 7 | Field selection, provenance, firm-signed claims, flagged text, dates not computed; AI interpretation conflicts; agent export refused; credential blocked; tamper, re-sign, foreign issuer; import authorization binding, single use, zero grants, no sending; encryption to one key; revocation and expiry; user-only actions absent from MCP and A2A |
| `workflow.test.mjs` | 4 | Pagination; forged, foreign and ahead cursors; wrong last-seen digest; references only; **1,011-event property test** (random page sizes; 60 random single-entry changes each caught at the exact entry; removal and reordering caught); restart from store keeps ids, cursors, chain and idempotent replay |
| `webhooks.test.mjs` | 5 | 9 unsafe callback URLs refused; signed content-free hints verified, duplicates and stale hints rejected; retries to dead letter; redirects refused and never followed; URL rechecked at delivery; subscription ownership |
| `planner.test.mjs` | 3 | Byte-identical output regardless of input order, no timestamps; dispositions across lifecycle states; goals reorder without changing dispositions |
| `mcp.test.mjs` | 4 | Official SDK client; protocol 2025-11-25; tool list equals the assistant-safe actions; URL elicitation opens the page only; send refused until the user approves, then once, then replayed; declined elicitation; error codes |
| `a2a.test.mjs` | 4 | Official SDK client; agent card; read completion; AUTH_REQUIRED until the user approves; completed task cannot send again; unknown and firm actions rejected |
| `bindings.test.mjs` | 4 | REST route, generic invoke, MCP and A2A give the same codes (approval required, not found, schema invalid) and the same manifest etag and plan digest |
| `python.test.mjs` | 3 | Vectors equal the generator; Python reproduces them; Python drives a live host |
| `compat.test.mjs` | 4 | 45 frozen 1.0 files; no 2.0 source changed; no sponsor product named; draft-only identifiers and no adoption or audit claims |
| `e2e.test.mjs` | 4 | 12-step journey; demo script; sandbox starter; conformance runner on mock and production builds |

## Measured numbers

| Measure | Value |
|---|---|
| Actions / MCP tools / A2A skills | 22 / 17 / 15 |
| Signed manifest size | 26,821 bytes |
| MCP tool list size | 15,916 bytes |
| OpenAPI document size | 91,837 bytes |
| Journal events in the property test | 1,011 |
| Journal events in the reference journey | 33 or more, chain verified |
| `npm ci` (this folder, warm cache) | 2.4 s |

## Package adversarial list: where each is tested

Agent self-approval (consent, e2e) · forged human approval (consent: code and digest required; agent 403) · changed digest (consent) · wrong recipient (consent, capsule) · duplicated send (consent, mcp, workflow restart) · expired and revoked grants (consent) · cross-tenant access (firm-tenancy, bindings) · forged and stale firm event (firm-tenancy) · SSRF webhook URLs (webhooks) · cursor skip (workflow) · webhook replay (webhooks) · prompt injection in the CaseBrief (consent, capsule, e2e) · unreviewed jurisdiction writes (policy) · agent engagement confirmation (no such action: contract, mcp, a2a) · revocation mid-flow (capsule, consent) · unauthorized new-agent import (capsule) · sensitive logging (firm-tenancy audit).

Not tested: malicious manifest URL fetched by a client (clients here only fetch the host they were given), file-URL SSRF (no file fetch in 3.0), lost network during send (only retry-after-response is tested), privilege upgrade via A2A delegation beyond the tests above, overbroad OAuth tokens (tokens come from the 2.0 host), private-document leakage beyond `content_included: false`.

## Known gaps

MCP 2026-07-28 not available in the pinned official SDK; no independent implementation; no usability study; Linux only; single-process store; 2.0 host in memory; A2A adapter unauthenticated on loopback; one unexplained intermittent 2.0 failure at baseline.
