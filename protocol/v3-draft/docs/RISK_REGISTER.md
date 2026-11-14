# Risk register

Likelihood and impact are rated low, moderate or high. Ratings are the authors' judgment, not measurements.

| ID | Risk | Likelihood | Impact | Mitigation in this draft | Status |
|---|---|---|---|---|---|
| R3-01 | An assistant is prompt-injected into sending, approving or contacting a second firm | high | high | No approving action exists in any binding; approvals only on the 2.0 page; digest-bound grants; content flagged and kept as data | implemented, tested |
| R3-02 | A planner "allowed" or a tool success is shown to the user as permission, delivery or representation | moderate | high | `not_authorization`, `status_semantics`, receipts note; gateway rechecks | implemented, tested; client wording awaiting counsel review |
| R3-03 | A binding skips a check the HTTPS path has | low | high | One `invoke()` for all bindings; cross-binding equivalence tests | implemented, tested |
| R3-04 | Policy changes between preview and send (time of check vs use) | moderate | high | Gateway runs again at the side effect; 2.0 host checks atomically | implemented, tested |
| R3-05 | A capsule is treated as consent to contact a firm | moderate | high | `authorizes_recipients: []`, `onward_disclosure: false`, `grants_created: 0`; a new approval is required | implemented, tested |
| R3-06 | A capsule leaks unselected or sensitive data | moderate | high | Field selection; excluded list; credential check; no transcripts, reasoning or document contents | implemented, tested |
| R3-07 | A second assistant uses another assistant's import authorization | moderate | moderate | Authorization bound to one `client_id` and one digest, single use | implemented, tested |
| R3-08 | Users believe revocation recalls copies already taken | moderate | moderate | Revocation statement says copies elsewhere cannot be recalled | implemented; wording awaiting counsel review |
| R3-09 | Webhook URL used for server-side request forgery | moderate | high | Checks at subscribe and at every delivery; no redirects; content-free hints | implemented, tested |
| R3-10 | Journal tampering or gaps go unnoticed | low | moderate | Hash chain, Ed25519 signatures, signed cursors, last-seen digest; property test over 1,011 events | implemented, tested |
| R3-11 | Duplicate sends after retries or lost responses | moderate | high | Scoped idempotency keys, stored results, sent-state check; concurrency test | implemented, tested (single process only) |
| R3-12 | Mock components mistaken for production (operator secret, store, in-memory 2.0 host, unauthenticated A2A) | moderate | high | Manifest `mode`; production writes fail closed; docs label mock only | implemented, tested; production components under design |
| R3-13 | Regulated writes enabled without counsel review | low | high | Production mode refuses every write unless a jurisdiction is `approved_by_counsel` and not stale | implemented, tested; no jurisdiction approved |
| R3-14 | MCP `2026-07-28` hosts expect features the pinned SDK lacks | high | low | Negotiated version recorded; gap documented | open |
| R3-15 | Intermittent failure in the 2.0-draft suite (1 of 97 on one baseline run) hides a real race | low | moderate | Recorded; later runs passed; needs a repeat-run investigation | open |
| R3-16 | The draft is cited as adopted, certified, audited or independently implemented | moderate | moderate | Status words everywhere; conformance results say "not certification" and never self-label independent | implemented, tested |
| R3-17 | No license grant covers 3.0-draft (the OWFa covers 1.0 only) | high | moderate | Flagged as a sponsor decision | open |
| R3-18 | A 3.0 feature is later found to read on Patent Family A | low | high | No search, ranking, ordering, freshness or recommendation is added or required | under design; awaiting sponsor confirmation |
| R3-19 | Sponsor lock-in perception reduces adoption | moderate | moderate | No sponsor service or account needed; neutrality test fails the build if a sponsor product is named | implemented, tested |
| R3-20 | Single-process store loses data or races under load | moderate | moderate | Atomic snapshots; documented as reference only | open for production |
