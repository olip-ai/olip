# Release gates

OLIP 2.0 was released by its sponsor on 2026-11-14 once the technical gates below were met. The open items are not release gates. They are listed so that no one reads them as done.

## Technical gates (met)

| # | Gate | Evidence |
|---|---|---|
| G-1 | All 2.0 tests, 1.0 tests, website tests and the publication scan pass | local runs on 2026-11-14; CI job `lifecycle-v2` |
| G-2 | Frozen 1.0 hashes 45 / 45 unchanged | `OLIP-1.0-SHA256SUMS.txt` check |
| G-3 | Generated schemas, state machines, OpenAPI, examples and vectors match their generators | drift tests |
| G-4 | The reference host passes the conformance runner in relay, direct, combined 1.0 + 2.0 and production-build modes | `conformance/results/` |
| G-5 | The patent rule holds: no search, ranking, ordering, freshness or reverse-dependency invalidation | spec section on patents; alphabetical registry only |

## Open items (not gates)

| Item | Owner | Status |
|---|---|---|
| Extending the OWFa patent commitment to 2.0 | Sponsor | not decided |
| External security review | Independent reviewer | not done |
| An independent implementation passing the conformance runner | Independent implementer | none yet |
| Manual accessibility review (WCAG 2.2 AA) of the approval page | Reviewer | automated test only |
| Real approval channel, durable storage and key custody | Each deployer | reference host is mock mode |
| Any production deployment | Each deployer | none |

## Rules that never change

- An item is "done" only with evidence: a test result, a signed review, or a recorded decision.
- Never call 2.0 adopted by a standards body, security audited, or independently implemented until that is true.
