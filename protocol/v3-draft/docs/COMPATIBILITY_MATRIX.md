# Compatibility matrix

"Tested" means an automated test in `tests/` exercises it on the build machine. Nothing here was tested by an independent party.

## Protocols and SDKs

| Binding | Implementation | Pinned version | Protocol version | Status |
|---|---|---|---|---|
| HTTPS | `reference/http.mjs` (Node `http`) | Node 22.23.4 (CI also runs Node 20, non-blocking) | OLIP `3.0-draft.1` | tested |
| MCP server | `adapters/mcp/server.mjs` on `@modelcontextprotocol/sdk` | 1.32.2 | `2025-11-25` (SDK's newest) | tested with the official SDK `Client` over its in-memory transport; stdio entry point not covered by an automated test |
| MCP `2026-07-28` | none | none | `2026-07-28` | **not supported**: no official TypeScript SDK release offering it was found (checked 2026-11-14) |
| MCP URL elicitation | server asks the client to open the approval page | 1.32.2 | `2025-11-25` | tested (accept, decline, client without support) |
| A2A server | `adapters/a2a/agent.mjs` on `@a2a-js/sdk` | 1.3.0 | A2A `1.0`, JSON-RPC | tested with the official SDK `ClientFactory` client |
| A2A REST / gRPC bindings | none | | | not implemented |
| A2A push notifications, streaming | none | | | not implemented (agent card says false) |

## Clients

| Client | Language | What is tested |
|---|---|---|
| `sdk/typescript` | TypeScript (fetch, WebCrypto) | Used by the journey, the adapters and most tests: manifest and journal verification, webhook check, sealed-capsule opening, retries |
| `sdk/python/olip_agent.py` | Python 3 (standard library; `cryptography` optional) | Written separately from the JavaScript reference; reproduces all vectors (9 of 9 with `cryptography`, 8 plus 1 skip without) and drives a live host |
| MCP SDK `Client` | TypeScript (official) | Tool listing, calls, elicitation, errors |
| A2A SDK client | TypeScript (official) | Agent card, send message, task states |

These are four client paths, but all were written or configured by the sponsor's tooling. The package's gate of three distinct agent frameworks and two endpoint implementations including one independent non-sponsor implementation is **not met** (gate G3-07).

## Earlier OLIP versions

| Version | Relationship | Evidence |
|---|---|---|
| OLIP 1.0 (wire 0.1, 0.2) | Untouched; 45 frozen files byte-identical | `tests/compat.test.mjs`; CI `git diff --exit-code` on 1.0 paths |
| OLIP 2.0-draft | Reused unchanged; same origin serves `/olip/v2/*` as before | `tests/compat.test.mjs` (no 2.0 source changed), `tests/contract.test.mjs` (pass-through); 2.0 suite still runs in its own CI job |
| 3.0-draft on a host without 2.0-draft | Not supported; 3.0-draft requires a co-located 2.0-draft lifecycle host | Constructor refuses to start without one |

## Runtime

| Item | Tested | Notes |
|---|---|---|
| Linux, Node 22 | yes | Build machine and blocking CI job |
| Linux, Node 20 | CI only, non-blocking | WebCrypto Ed25519 and X25519 are available in Node 20 |
| macOS, Windows | no | |
| Browsers (TypeScript SDK) | no | Uses only fetch and WebCrypto; not run in a browser |
