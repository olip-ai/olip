# Progress

Status words: implemented · tested · mock only · under design · awaiting counsel review · awaiting security review · not deployed.

| Wave (package) | Work | Status |
|---|---|---|
| 0 Audit and preservation | Baseline audit, frozen 1.0 hashes, 2.0 status, pinned SDK versions, risks, ADRs | done (`BASELINE_AUDIT.md`, `ARCHITECTURE.md`, `RISK_REGISTER.md`) |
| 1 Contracts and SDK skeleton | Version and schema namespace, signed manifest, 22 action contracts, 46 JSON Schemas, OpenAPI 3.1, error catalog, TypeScript and Python clients, vectors | implemented, tested |
| 2 Policy and safe actions | Policy gateway (5 decisions, fail closed), approval-bound disclosure on the 2.0 approval page, firm-signature verification via 2.0, idempotency, planner, negative tests | implemented, tested, mock only |
| 3 Capsule and resumption | Selective signed capsules with provenance, optional X25519 encryption, user import authorization, revocation; durable workflow ids, signed journal, cursors, gap detection, webhooks, restart from store | implemented, tested, mock only |
| 4 Transport bindings | HTTPS reference, MCP adapter (official SDK 1.32.2, protocol 2025-11-25), A2A 1.0 adapter (official SDK 1.3.0), cross-binding equivalence | implemented, tested; MCP 2026-07-28 not available in an official SDK |
| 5 Developer adoption | Sandbox (`npm start`), quickstart, conformance runner, compatibility matrix | implemented; the 30-minute developer study is not done |
| 6 Beta and stable gates | Security review, counsel review, independent implementation, governance | not started; see `RELEASE_GATES.md` |

Lifecycle coverage through 3.0 (every step uses the unchanged 2.0 rules): discovery, conflict-aware screening, the fuller CaseBrief after the firm says intake may continue, consultation request and time selection, engagement offer review and acceptance with separate firm confirmation, approved messages, closure, and a final personal capsule. All are exercised by the 12-step journey (`reference/journey.mjs`).

Not done: production approval channel, durable multi-process store, key custody, authenticated A2A, browser run of the TypeScript client, macOS and Windows runs, MCP 2026-07-28, independent implementations, usability study, external reviews.
