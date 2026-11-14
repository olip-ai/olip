# Release gates

Each gate must be met before the step to its right. Today no gate past "draft merged" is met.

| # | Gate | Owner | Status |
|---|---|---|---|
| G-1 | All 2.0-draft tests, 1.0 tests, website tests and the publication scan pass in CI | Maintainers | tested locally; CI job added, awaiting first CI run |
| G-2 | Frozen 1.0 hashes 45 / 45 unchanged | Maintainers | tested |
| G-3 | Sponsor decides the license grant for 2.0 (the OWFa covers 1.0 only) | Sponsor (Digital Crossings Inc) | open |
| G-4 | Sponsor patent review confirms no 2.0 profile requires Patent Family A methods | Sponsor | under design: the draft adds no search or ranking; awaiting sponsor confirmation |
| G-5 | Counsel review of notices, consent wording and at least one jurisdiction's rules | Counsel | awaiting counsel review |
| G-6 | External security review of the host, the firm endpoint and the adapters | Independent reviewer | awaiting security review |
| G-7 | At least one independent implementation passes the conformance runner, run by someone other than its author | Independent implementer | not started |
| G-8 | Manual accessibility review (WCAG 2.2 AA) of the approval page | Reviewer | under design |
| G-9 | Real approval channel (code delivery, identity), durable storage and key custody | Implementers | under design |
| G-10 | Public comment period on the draft through the governance process | Governance | not started |
| G-11 | Adoption as OLIP 2.0 | Governance | not started |
| G-12 | Any production deployment | Deployer, after G-5, G-6 and G-9 for the jurisdictions involved | **not deployed; nothing is production approved** |

## Rules that never change

- No production deployment and no real-client transmission without the necessary approvals.
- A gate is "met" only with evidence: a test result, a signed review, or a recorded decision.
- Merging this draft into the repository is not adoption, not approval and not deployment.
