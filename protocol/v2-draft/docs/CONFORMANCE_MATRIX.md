# Conformance matrix

The runner is `conformance/run.mjs`. It is a black-box runner: it talks HTTP only. Each check reports `pass`, `fail`, `skip` or `mock_only`. A `mock_only` result is not a production pass. A self-run result is never labeled independent. Results are written to `conformance/results/`.

Status: **implemented, tested.** No independent implementation has been tested yet.

## Results on 2026-11-14 (reference code, fictional data)

| Check | What it checks | relay | direct | compat 1.0 + 2.0 | production build |
|---|---|---|---|---|---|
| C-01 | Capabilities document is served, valid, and marks the draft as not adopted | pass | pass | pass | pass |
| C-02 | Well-known lifecycle manifest equals the capabilities document | pass | pass | pass | pass |
| C-03 | OLIP 1.0 manifest (if served) advertises the lifecycle extension without changing 1.0 versions | skip (no 1.0 manifest) | skip | pass | skip |
| C-04 | Production hosts expose no mock hooks | mock_only | mock_only | mock_only | pass |
| C-05 | Recipient list is alphabetical and states that payment never affects order | pass | pass | pass | pass |
| C-06 | Host keys are Ed25519 JWKs with a purpose | pass | pass | pass | pass |
| C-07 | Unauthenticated writes are refused with an OLIP error | pass | pass | pass | pass |
| C-08 | Unknown operations return 404 with an OLIP error | pass | pass | pass | pass |
| C-09 | Responses carry no-store and nosniff headers | pass | pass | pass | pass |
| B-01 | User signs in and delegates an assistant; the assistant gets its own token | pass | pass | pass | pass |
| B-02 | Assistant can prepare a minimal screening; the response never includes the approval code | pass | pass | pass | skip (gate closed) |
| B-03 | The assistant cannot approve (403 `OLIP_AGENT_CANNOT_APPROVE`) and cannot read the approval page | pass | pass | pass | skip |
| B-04 | Nothing is sent before the user approves | pass | pass | pass | skip |
| B-05 | After the user approves, the screening is delivered only with the firm's signed receipt | mock_only (code read from the mock inbox) | mock_only | mock_only | skip |
| B-06 | A used approval cannot be reused (410 `OLIP_AUTHORIZATION_EXPIRED`) | pass | pass | pass | skip |
| B-07 | Mutations without Idempotency-Key are refused | pass | pass | pass | skip |
| B-08 | The assistant cannot record a firm's lifecycle event | pass | pass | pass | skip |
| B-09 | The matter journal is hash-chained and host attestations verify | pass | pass | pass | skip |
| B-10 | Passport export is signed, transmits nothing and authorizes nobody | pass | pass | pass | skip |
| S-01 | Every response seen in the run matches the published JSON Schemas | pass | pass | pass | pass |
| **Totals** | | **17 pass, 1 skip, 2 mock_only, 0 fail** | **17 / 1 / 2 / 0** | **18 pass, 2 mock_only, 0 fail** | **10 pass, 10 skip, 0 fail** |

The exact per-target JSON is in `conformance/results/*.json`; where this table and those files differ, the files are correct. In the production build the policy gate refuses every lifecycle write, so behavior checks are skipped rather than faked.

## Requirement-to-test matrix (automated tests, `npm test`)

| Requirement | Tests |
|---|---|
| User approves every disclosure; agents cannot approve | consent (14), Scenario D, a2a, mcp, B-03 |
| Conflict-aware staging (INV-09) | consent "fuller CaseBrief before…", "additional screening may contain only…", Scenario B |
| Firm-only confirmation (INV-01, INV-02) | firm-authority (9), consultation-engagement (10), machines "authority" |
| No inferred attendance, delivery or reading (INV-10) | consultation "time passing…", messages "transport acceptance is not delivery", Scenario E |
| Event integrity (INV-06, INV-07) | firm-authority "replayed, stale…", "contradictory…" |
| Closure rules (INV-05) | messages "after the firm terminates…" |
| Grants never carry over (INV-08) | consent "one approval, one recipient", Scenario C |
| 1.0 unchanged (INV-03) | compat (6) |
| Schemas, OpenAPI, examples, machines match generators | schemas (7), openapi (4), machines (5), vectors |
| Independent re-implementation of crypto and digests | vectors-python (5) |
| Tenancy, rate limits, logs, encryption, journal, webhooks, SSRF, pagination, policy gate | tenancy-ops (10) |
| Neutral discovery | C-05 |

## How to claim conformance

State the profiles, the topology, the build (test or production) and the runner version, and publish the results file unchanged. Do not call a result independent unless someone other than the implementer ran it against an implementation they did not write.
