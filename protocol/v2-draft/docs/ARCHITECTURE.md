# Architecture decision record: OLIP 2.0-draft

Status of this record: **implemented, tested, mock only, not deployed.**

## Context

OLIP 1.0 stops at the handoff. Consumers and their assistants need a way to continue with a chosen firm through screening, consultation, engagement, communication and closure. Three things must hold throughout:

- The consumer still approves every disclosure.
- The firm alone confirms anything that only a firm can know or decide.
- No vendor, including the sponsor, becomes a required intermediary.

## Components

```
Consumer ──(approval page, one-time code)──► Lifecycle host ◄──(signed firm events, receipts)── Firm endpoint / firm system
                                               ▲    │
Assistant (API / MCP / A2A) ──(prepare, read)──┘    └──► journal (hash chain), webhooks (signed hints)
```

| Component | File | Role |
|---|---|---|
| Lifecycle host | `reference/lifecycle-host.mjs` | Stores matters, approvals, grants, state; checks every firm event; keeps the journal |
| Firm endpoint | `reference/firm-endpoint.mjs` | The firm side: receives disclosures, signs receipts and events with staff authority |
| System wiring | `reference/system.mjs` | Starts the host, firms and mock outbox in the direct or relay topology |
| Combined host | `reference/compat-host.mjs` | One address serving OLIP 1.0 and 2.0-draft |
| Core library | `reference/lib/core.mjs` | Digests, Ed25519, grant digest, zoned time, sensitive-data patterns, files |
| SSRF guard | `reference/lib/ssrf.mjs` | Callback URL checks, including DNS rebinding |
| TypeScript client | `sdk/typescript/` | WebCrypto signatures, webhook and status helpers |
| Python client | `sdk/python/` | Separate standard-library code, used as an independent check |
| MCP adapter | `adapters/mcp/` | Official MCP TypeScript SDK |
| A2A adapter | `adapters/a2a/` | Official A2A JavaScript SDK |

## Decisions

### ADR-001: Separate package, frozen 1.0 untouched

**Decision:** 2.0 is the package `protocol/v2-draft`, with its own schemas namespace (`https://olip.ai/spec/2.0-draft/schemas/`), base path `/olip/v2` and version string `2.0-draft`.

**Why:** 1.0 is frozen by SHA-256. Any change in place would break the freeze promise.

**Evidence:** `tests/compat.test.mjs` (45 of 45 hashes, no 2.0 file in a 1.0 folder, 1.0 conformance against the combined host).

### ADR-002: Five negotiated profiles and one state machine per object

**Decision:** Core plus four optional profiles. Each lifecycle object has its own machine, and every transition names its actor role. The machines are data (`status-machines/*.json`), and code, schemas and tests are generated from or checked against them.

**Why:** A machine per object keeps authority checks local and testable. It also prevents state leaks, for example a 2.0 state turning up in a 1.0 handoff.

**Evidence:** `tests/machines.test.mjs` runs exhaustive and random-walk checks, 5,000 steps per machine.

### ADR-003: 2.0 docs stay out of the public website

**Decision:** All 2.0 documents live in `protocol/v2-draft/docs/` and `protocol/v2-draft/spec/`. The root `docs/` folder (Docusaurus) is not changed.

**Why:** The root `docs/` folder publishes olip.ai, and the website must not show draft or unadopted material as if it were the protocol. The master prompt suggested `docs/2.0/`; this record departs from that path on purpose.

**Consequence:** Publishing 2.0 on the website later is a separate, explicit sponsor decision.

### ADR-004: Consumer approval is out of band and agent-proof

**Decision:** Every disclosure creates a grant and an approval. The consumer approves on the host's page with a one-time code sent to their own contact. Agents get `403 OLIP_AGENT_CANNOT_APPROVE` at the decision endpoint. Submit checks the grant digest.

**Why:** An assistant can be wrong, compromised or prompt-injected. The only defense that holds is that its token cannot approve.

**Limitation:** The approval method is `hosted_otp_mock`. A real code delivery channel and real identity proofing are under design.

### ADR-005: Firm facts need a firm signature and the firm's own authority document

**Decision:** The firm's key signs each firm fact with Ed25519. The host checks the key set, revocation, the signed authority document (staff, role, event types, expiry), the revision, freshness, replay and the transition. A host key never satisfies a firm check.

**Why:** In the relay topology the host is a third party. It must be unable to claim that a firm confirmed something.

### ADR-006: No search or ranking in 2.0

**Decision:** The recipient registry is alphabetical with `paid_influence: false`. 2.0 adds no search, ranking, ordering, freshness or matching method.

**Why:** Neutrality, and the sponsor's patent rule that no OLIP version may require Patent Family A methods.

**Evidence:** Conformance check C-05.

### ADR-007: Assistant bindings use official SDKs, pinned

**Decision:**

- MCP uses `@modelcontextprotocol/sdk` 1.32.2 (latest protocol version `2025-11-25`).
- A2A uses `@a2a-js/sdk` 1.3.0 (A2A protocol `1.0`, JSON-RPC binding).

Both are pinned exactly.

**Gap:** The MCP specification revision dated 2026-07-28 is not available in any published official TypeScript SDK as of this work. The adapter negotiates whatever the SDK offers. Moving to 2026-07-28 is under design and waits for an SDK release.

### ADR-008: Delivery and reading are facts with sources, never inferences

**Decision:** Delivery needs the recipient endpoint's signed receipt. Reading needs the reader's own action. Attendance needs a named firm source.

**Why:** False "delivered" or "attended" states would mislead consumers about deadlines and representation.

### ADR-009: Production mode fails closed

**Decision:** In production mode, a host refuses every lifecycle write for a jurisdiction whose policy is not `approved_by_counsel`. Today no jurisdiction is approved, so a production build accepts no lifecycle writes at all.

**Evidence:** The `reference-production-build` conformance target shows 10 pass, 10 skip and 0 fail.

## Topologies

| Topology | Who runs the host | Tested |
|---|---|---|
| Direct | The firm | Yes (`reference-direct`) |
| Relay | Neutral Relay Co. (fictional independent vendor) | Yes (`reference-relay`) |
| Combined 1.0 + 2.0 address | Either | Yes (`reference-compat-1.0-and-2.0`) |
