# Risk register

Likelihood and impact are rated low, moderate or high. Ratings are the authors' judgment, not measurements.

| ID | Risk | Likelihood | Impact | Mitigation in this draft | Status |
|---|---|---|---|---|---|
| R-01 | A consumer reads "firm confirmed engagement" as a legal guarantee of representation | moderate | high | Attributed wording with a qualifier; firm-only signed event | implemented, tested; wording awaiting counsel review |
| R-02 | A prospective-client screening discloses confidential facts that later create a conflict | moderate | high | Minimal firm allowlist first; full CaseBrief only after eligibility; sensitive-data blocks | implemented, tested; awaiting counsel review |
| R-03 | An assistant is prompt-injected into sending or approving | high | high | Agents cannot approve; content is inert data; digests bind exact content | implemented, tested |
| R-04 | A relay operator forges or alters firm facts | low | high | Firm signatures plus the authority document; journal hash chain | implemented, tested |
| R-05 | A firm signing key is stolen | moderate | high | Revocation, rotation, read-time downgrade of earlier claims | implemented, tested; key custody under design |
| R-06 | False "delivered" or "attended" status causes a missed deadline | moderate | high | Signed receipts; named attendance source; no inference | implemented, tested |
| R-07 | Mock components are mistaken for production (codes, malware scan, storage) | moderate | high | Capabilities state `mode`; the production gate fails closed; C-04 checks for mock hooks; docs label mock only | implemented, tested |
| R-08 | Unauthorized practice or intermediary rules in some states apply to the relay topology | moderate | high | Policy gate; no jurisdiction opens without counsel | awaiting counsel review |
| R-09 | No patent or copyright grant covers 2.0 (the OWFa covers 1.0 only), which deters implementers | high | moderate | Flagged as a sponsor decision | open |
| R-10 | Some 2.0 feature is later found to read on Patent Family A | low | high | No search, ranking, ordering, freshness or reverse-dependency invalidation in 2.0; alphabetical registry only | under design; awaiting sponsor confirmation |
| R-11 | Perceived sponsor lock-in reduces adoption | moderate | moderate | No sponsor service needed; both topologies; any vendor can run either side; neutrality check C-05 | implemented, tested |
| R-12 | MCP and A2A specifications move faster than the official SDKs | high | low | Pinned SDKs; protocol versions are negotiated; the gap is recorded | implemented; MCP 2026-07-28 under design |
| R-13 | The draft is cited as adopted, audited or independently implemented | moderate | moderate | Status words in every document; capabilities say `proposed_draft_not_adopted`; conformance is never self-labeled independent | implemented, tested |
| R-14 | Accessibility barriers on the approval page exclude users | moderate | moderate | Labels, landmarks, language attribute, one automated test | tested (automated only); manual review under design |
| R-15 | The reference host's in-memory storage loses state | high (if misused) | moderate | Documented as mock only; not for deployment | mock only |
| R-16 | Pattern-based sensitive-data blocking gives false confidence | moderate | moderate | Documented as a safeguard, not a guarantee | implemented, tested |
