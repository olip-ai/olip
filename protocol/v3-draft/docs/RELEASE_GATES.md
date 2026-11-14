# Release gates

Each gate must be met before the step to its right. Today no gate past "draft merged" is met.

| # | Gate (package target) | Owner | Status |
|---|---|---|---|
| G3-01 | All 3.0-draft, 2.0-draft and 1.0 tests, website tests and the publication scan pass in CI | Maintainers | tested locally; CI job added, awaiting first CI run |
| G3-02 | Frozen 1.0 hashes 45 / 45 unchanged; no 2.0-draft source changed | Maintainers | tested |
| G3-03 | V2 dependency: lifecycle profiles implemented and tested | Maintainers | met by the merged 2.0-draft reference (mock only) |
| G3-04 | Core 3.0 conformance: required positive and negative checks green | Maintainers | tested: 18 pass, 0 fail, 1 mock-only (mock build); 9 pass (production build) |
| G3-05 | Zero unauthorized disclosures or firm-authority violations in the adversarial suite | Maintainers | tested (see TEST_REPORT) |
| G3-06 | Zero duplicate side effects across bounded idempotent retries | Maintainers | tested, single process |
| G3-07 | At least 3 distinct agent frameworks and 2 endpoint implementations, including one independent non-sponsor implementation | Independent implementers | **not met** |
| G3-08 | A developer with an existing AI system completes the fictional flow in 30 minutes or less (measured user test) | Usability study | **not measured** |
| G3-09 | MCP `2026-07-28` support through an official SDK | Maintainers | **not met**: no official SDK release found |
| G3-10 | Sponsor decides the license grant for 3.0-draft | Sponsor | open |
| G3-11 | Sponsor patent review confirms no 3.0 profile requires Patent Family A methods | Sponsor | awaiting sponsor confirmation |
| G3-12 | Counsel-reviewed rules for each enabled production jurisdiction and matter profile; wording of status meanings and capsule statements | Counsel | awaiting counsel review |
| G3-13 | Independent security assessment with no unresolved critical findings | Independent reviewer | awaiting security review |
| G3-14 | Production components: real approval channel, durable multi-process store, key custody and rotation, authenticated A2A | Implementers | under design |
| G3-15 | Public comment period through the governance process | Governance | not started |
| G3-16 | Adoption as OLIP 3.0 | Governance | not started |
| G3-17 | Any production deployment or real-client transmission | Deployer, after G3-12, G3-13 and G3-14 | **not deployed; nothing is production approved** |

## Rules that never change

- No production deployment and no real-client transmission without the necessary approvals.
- A gate is "met" only with evidence: a test result, a signed review, or a recorded decision.
- Merging this draft into the repository is not adoption, not approval and not deployment. Publishing anything on olip.ai is a separate, explicit step.
