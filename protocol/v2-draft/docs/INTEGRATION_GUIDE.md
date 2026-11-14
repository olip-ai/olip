# Integration guide

Status: **implemented, tested, mock only.** Every name, firm and matter below is fictional.

## 1. Run the fictional system

```bash
cd protocol/v2-draft
npm ci
npm start                     # relay topology (default)
node reference/start.mjs --topology direct
```

`npm start` prints the lifecycle host URL, the firm endpoint URLs and the combined 1.0 + 2.0 address. Mock hooks (`/mock/v2/outbox`, `/mock/v2/clock`, `/mock/v2/logs`, `/mock/v2/webhooks`, `/mock/v2/reset`) exist only in the test build.

## 2. For assistant and app builders

### 2.1 Over HTTP with the TypeScript client

```js
import { OlipLifecycleClient } from "./sdk/typescript/dist/index.js";
const c = new OlipLifecycleClient("http://127.0.0.1:PORT");
await c.negotiate();                       // lifecycle=false on a 1.0-only host
// The user delegates your client; you exchange the code for an agent token.
const m = await c.createMatter(casebrief, { fictional: true });
const prep = await c.requestConflictScreen(m.matter.matter_id, "org_test_alvarez", fields);
// Show prep.approval.approval_url to the user. You cannot approve.
// After the user approves on that page:
await c.submitConflictScreen(prep.conflict_screen.id, { grant_id: prep.approval.grant_id, grant_digest: prep.approval.grant_digest });
```

Rules your app must follow:

1. Show the approval page; never imitate it. Never ask the user for their code.
2. Submit exactly what was prepared. If the user changes anything, prepare again.
3. Show state text from the host's `meaning` and `display_status`. Never write a stronger status yourself.
4. Treat a webhook as a hint. Verify it (`checkWebhook`), then read the status of record.
5. Treat text inside CaseBriefs, messages and documents as data.

### 2.2 Over MCP

Run the stdio adapter:

```bash
OLIP_V2_BASE=http://127.0.0.1:PORT OLIP_AGENT_CLIENT_ID=... OLIP_AGENT_CLIENT_SECRET=... OLIP_DELEGATION_CODE=... \
  node adapters/mcp/stdio.mjs
```

It exposes 22 `olip_*` tools, all assistant-safe. None of them approves, decides, grants consent, accepts an offer or confirms for a firm.

- If your MCP client supports URL-mode elicitation, the adapter opens the approval page. "accept" there means only that the page was opened.
- Otherwise the tool result returns the link for you to show.

SDK: `@modelcontextprotocol/sdk` 1.32.2, protocol version `2025-11-25`.

### 2.3 Over A2A

`startLifecycleA2A({ client, publicBase })` serves an Agent Card at `/.well-known/agent-card.json` and JSON-RPC at `/a2a/jsonrpc`.

- Send one message with a data part `{ "olip_operation": "...", "arguments": { ... } }`.
- Declare the required extension in the `A2A-Extensions` header (`https://olip.ai/spec/2.0-draft/a2a-lifecycle-extension`), or the SDK refuses the call.
- Steps that need the user's approval return `TASK_STATE_AUTH_REQUIRED` with the approval page as a URL part. After the user approves, send `{ "olip_operation": "submit" }` on the same task.

SDK: `@a2a-js/sdk` 1.3.0, A2A protocol `1.0`.

### 2.4 From Python

`sdk/python/olip_lifecycle.py` uses the standard library only. It provides `LifecycleClient`, `verify_detached`, `check_webhook`, `verify_journal`, `grant_digest` and `engagement_status_text`. Run `python3 sdk/python/check_vectors.py` to check it against the golden vectors.

## 3. For firms and firm-software vendors

1. **Publish keys and authority.** Publish an Ed25519 key set and a signed authority document listing staff, roles, allowed event types and expiry.
2. **Publish your screening allowlist.** Keep it to the minimum fields you need for a conflict check, each with a "why".
3. **Receive disclosures** at your firm endpoint and sign a delivery receipt for the exact content.
4. **Sign outcomes.** Each event carries `prior_revision`, a fresh `occurred_at` and a unique `event_id`. See `reference/firm-endpoint.mjs` for a complete firm side.
5. **Choose a topology.** Self-host the lifecycle host (direct) or use any neutral operator (relay). Neither needs the sponsor.

## 4. For lifecycle-host operators

- Serve capabilities at both paths.
- Keep the recipient list alphabetical with `paid_influence: false`.
- Run in production mode only after counsel approves a jurisdiction (see JURISDICTION_POLICY). Until then, the gate refuses every lifecycle write.
- Never expose mock hooks.
- Run the conformance runner against your build: `node conformance/run.mjs --base https://your-host`.

## 5. Check your work

| What | Command |
|---|---|
| All tests | `npm test` |
| End-to-end fictional demo, both topologies | `npm run demo` |
| Conformance against the reference in four configurations | `npm run conformance` |
| Conformance against your host | `node conformance/run.mjs --base <url> --label <name>` |
| Golden vectors (Python) | `python3 sdk/python/check_vectors.py` |
