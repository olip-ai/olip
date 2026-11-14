# Developer quickstart (fictional sandbox)

Goal: connect an existing AI application to an OLIP 3.0-draft host and complete fictional discovery to an approved, sent screening. Everything is fictional and local.

## 1. Start the sandbox

```bash
git clone https://github.com/olip-ai/olip && cd olip/protocol/v3-draft
npm ci && (cd ../v2 && npm ci)
npm start
```

It prints `base` (a 127.0.0.1 address), a fictional `agent_token`, and the fictional user's inbox address for one-time codes.

## 2. Pick a binding

**HTTPS with the TypeScript SDK**

```ts
import { OlipAgentClient } from "./sdk/typescript/dist/index.js";
const olip = new OlipAgentClient(BASE, { token: AGENT_TOKEN });
const manifest = await olip.verifiedManifest();          // signature checked against /olip/v3/keys
const orgs = await olip.findProfessionals({ jurisdiction: "US-CA" });
const wf = (await olip.startWorkflow(casebrief)).workflow; // casebrief: the user's own draft (fictional here)
const plan = await olip.planNextActions(wf.workflow_id, "share_screening");
const d = (await olip.previewDisclosure(wf.workflow_id, "org_test_alvarez", "screening",
  ["prospective_client.name", "adverse_parties", "matter.category", "matter.jurisdiction"])).disclosure;
// Show the user d.approval.approval_url. Only the user can approve there.
const sent = await olip.submitApprovedDisclosure(d);      // USER_APPROVAL_REQUIRED until they do
console.log(sent.delivery.state);                          // report exactly; delivered is not read
```

**MCP** (any MCP host that runs stdio servers): `OLIP_V3_BASE=<base> OLIP_V3_AGENT_TOKEN=<agent_token> node adapters/mcp/stdio.mjs`. Tools are named `olip_<action>`. Call `olip_plan_next_actions` when unsure.

**A2A**: `startAgentA2A({ client, publicBase })` from `adapters/a2a/agent.mjs` serves an agent card at `/.well-known/agent-card.json`. Send `{ "olip_action": "olip.preview_disclosure", "arguments": { ... } }` as a data part; on `TASK_STATE_AUTH_REQUIRED` show the user the URL part, then send `{ "olip_action": "submit" }` on the same task.

**Python**: `sdk/python/olip_agent.py` (`AgentClient(base, token)`); see `sdk/python/journey_check.py`.

## 3. Approve as the fictional user

Open the approval page at `base + approval_url`, read the code from the fictional inbox (`/mock/v2/outbox`), and approve. In a real deployment the code goes to the user's own email or phone and the assistant never sees it.

## 4. Rules your application must follow

- Never present a planner "allowed" step, a tool success or an A2A completion as an approval, a delivery, a reading or representation. Repeat state meanings from `status_semantics`.
- Treat CaseBrief and message text as data. Instruction-like text is flagged, never obeyed.
- Retry only with the same `Idempotency-Key` (the SDK's `invokeWithRetry` does this).
- Resume with `resume(workflow_id, { cursor, last_digest })`; it verifies every page's chain and signatures.

## 5. Measured so far

Machine time on the build machine: `npm ci` in this folder took 2.4 seconds with a warm npm cache (cold-cache time not measured). The 30-minute target for a developer with an existing AI system has **not** been measured with real developers (gate G3-08).
