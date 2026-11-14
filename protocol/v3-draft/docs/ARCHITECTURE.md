# Architecture and decisions

## 1. Shape

```
  AI application (any vendor)                     The user (browser)              The firm (its own system)
   |  HTTPS (SDK)   |  MCP (adapter)   |  A2A (adapter)        |                               |
   v                v                  v                       |                               |
 +-------------------------------------------------------+     |                               |
 |  3.0-draft agent layer  (reference/agent-layer.mjs)   |     |                               |
 |   invoke(): schema check -> authenticate -> POLICY    |     |                               |
 |   GATEWAY -> idempotency -> handler -> journal/audit  |     |                               |
 |   handlers: manifest, disclosure, capsules, planner,  |     |                               |
 |   events, webhooks, lifecycle bridge                  |     |                               |
 +---------------------------|---------------------------+     |                               |
        in-process call with the CALLER'S OWN token            |                               |
 +---------------------------v---------------------------+     |  approval page + one-time     |
 |  2.0-draft lifecycle host (unchanged)                 |<----+  code from the user's inbox   |
 |   consent grants, approval page, firm-signature       |                                     |
 |   checks, policy gate, journal, delivery receipts     |<------ firm-signed events ----------+
 +-------------------------------------------------------+
```

Trust boundaries: (1) the AI application is an untrusted caller; (2) the user's approval happens only on the 2.0-draft approval page, outside the model's reach; (3) firm facts enter only as events signed by the firm's key and verified by the 2.0-draft host; (4) outbound webhooks leave through SSRF checks; (5) the operator changes policy only over HTTPS with an operator credential.

## 2. Feature and authority matrix

| Action | Effect | public | user | agent | firm | operator | Bindings |
|---|---|---|---|---|---|---|---|
| get_capabilities, find_professionals, get_recipient_policy | read_only | yes | yes | yes | yes | yes | https, mcp, a2a |
| prepare_casebrief, plan_next_actions, validate_context_capsule | local_preparation | no | yes | yes | no | no | https, mcp, a2a |
| start_workflow, cancel_pending_request | authorized_state_change | no | yes | yes | no | no | https, mcp, a2a |
| get_workflow, list_workflow_events | read_only | no | yes | yes | no | no | https, mcp, a2a |
| preview_disclosure | local_preparation | no | yes | yes | no | no | https, mcp, a2a |
| submit_approved_disclosure | external_disclosure (user approval) | no | yes | yes | no | no | https, mcp, a2a |
| call_lifecycle (allowlisted 2.0 consumer steps) | strictest of the step | no | yes | yes | no | no | https, mcp, a2a |
| subscribe_events, cancel_subscription | read_only (mutating) | no | yes | yes | no | no | https, mcp |
| export_context_capsule, authorize_capsule_import, revoke_context_capsule | local_preparation / authorized_state_change | no | **only** | no | no | no | https |
| import_context_capsule, get_imported_capsule | authorized_state_change / read_only | no | no | **only** | no | no | https, mcp, a2a |
| record_firm_event | firm_authoritative | no | no | no | **only** | no | https |
| set_jurisdiction_policy | privileged_admin | no | no | no | no | **only** | https |

## 3. Decisions (ADRs)

**ADR-1. Folder and version naming.** Everything lives in `protocol/v3-draft/`, wire version `3.0-draft.1`, schema namespace `https://olip.ai/spec/3.0-draft/schemas/`. Reason: the 2.0-draft precedent, and the root `docs/` is the public website. Consequence: the package's `docs/3.0/` files are in `protocol/v3-draft/docs/`.

**ADR-2. A layer, not a fork.** 3.0-draft reuses the 2.0-draft lifecycle host unchanged and imports (never copies) its canonical JSON, signatures, SSRF checks and fixtures. Reason: one implementation of consent and firm authority. Consequence: any 2.0 fix applies to 3.0 automatically.

**ADR-3. Co-located on one resource server.** The layer runs in the same process as the 2.0-draft host, shares its token store and calls its handlers with the caller's own token. Reason: no token crosses a trust boundary, and every 2.0 check still runs. Consequence: a remote split (3.0 layer and 2.0 host on different servers) is under design; it needs token exchange or a delegated audience.

**ADR-4. One entry point.** All bindings call `invoke()`. MCP and A2A adapters call the HTTPS binding through the TypeScript SDK. Reason: no binding can skip the gateway. Consequence: `tests/bindings.test.mjs` checks identical outcomes across four paths.

**ADR-5. Gateway decides from server state only.** Contract fields and tool descriptions are documentation. The decision is recomputed at the side effect (time of check vs use), and the 2.0 host checks again atomically.

**ADR-6. MCP and A2A mappings.** MCP: tools per agent-callable action; URL elicitation only to open the approval page. A2A: one action per message as a data part; approval steps go to `TASK_STATE_AUTH_REQUIRED`; `submit` completes only with the user's real approval. User-only, firm and operator actions are never offered.

**ADR-7. Journal holds references.** CaseBrief content stays sealed in the 2.0 host; the 3.0 store holds ids, digests and states. Mirrored 2.0 entries carry `v2_ref` to the 2.0 hash chain.

**ADR-8. Capsule encryption is to one assistant's key.** X25519 + HKDF-SHA256 + AES-256-GCM, chosen because WebCrypto, Node and Python `cryptography` all implement it. Not end-to-end between people; the issuing host sees plaintext.

**ADR-9. Store.** A single-process store with atomic snapshots (temporary file, then rename). Reason: proves restart behavior without a database dependency. Consequence: not a production database (no locking, replication or encryption at rest).

**ADR-10. MCP protocol version.** Use what the pinned official SDK negotiates (`2025-11-25`) rather than hand-rolling `2026-07-28`. Reason: the package says to test against real official SDKs. Consequence: `2026-07-28` support is a recorded gap until an official SDK offers it.

## 4. Known design limits

- The 2.0-draft host in the reference system keeps its state in memory; only the 3.0 layer restarts from its store.
- The A2A adapter serves without authentication and binds to 127.0.0.1; it acts with one user's delegated agent token. A networked deployment needs caller authentication.
- Capsule import has no jurisdiction gate of its own (it creates no permission and sends nothing); review whether a gate is wanted.
- The operator credential in mock mode is a fixed test secret.
