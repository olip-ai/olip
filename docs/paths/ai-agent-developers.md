---
id: ai-agent-developers
title: Path for AI agent developers
description: Connect an AI agent to OLIP over MCP or HTTPS with explicit tool permissions, test against a fictional local endpoint, and read results and status truthfully. Pinned to OLIP 0.1 with optional 0.2.
---

# Path for AI agent developers

**Pinned to:** OLIP 0.1 (base) and the optional 0.2 additions, kit `olip-0.2-draft-kit.zip`. **You need:** Node.js 20 or later. Everything here is fictional and runs on your own computer.

## 1. Five-minute read-only discovery

Read-only calls need no login and change nothing. Follow [Read-only discovery in five minutes](/docs/paths/read-only-discovery/). You will see:

- a plain-English problem interpreted, with its **unknowns** listed for the person to answer;
- the ordering method and `paid_influence: false`;
- license evidence with a source, a date and a level (`official_source_checked` versus merely indexed);
- a **no-match** answer with free legal-help options instead of an empty list.

## 2. A complete fictional handoff (30 minutes)

Run the [quickstart](/docs/quickstart/). It goes through preview, the person's approval, the handoff, the signed receipt, status events, withdrawal, and the failure paths.

## 3. Connect your agent

| Binding | Use it when | Page |
|---|---|---|
| MCP | Your agent runs in an MCP host | [OLIP over MCP](/docs/implementing/olip-over-mcp/) |
| HTTPS + OpenAPI 3.1 | You call OLIP endpoints directly | [OpenAPI](pathname:///spec/0.1/openapi/olip-0.1.json) |
| A2A (optional profile) | Your agent speaks A2A | [Interoperability](/docs/implementing/interoperability/) |

**Tool permissions.** The reference MCP adapter (`reference/mcp-adapter.mjs`) deliberately has **no approve tool**. Your agent may discover, draft a CaseBrief, build a preview and submit a handoff the person already approved. It may never approve on the person's behalf, and it may never record a recipient outcome. Keep those two boundaries in your own tool design.

## 4. Read results truthfully

| Status | Say to the person | Never say |
|---|---|---|
| `recorded`, `queued` | "Saved, not sent yet." | "Sent" |
| `sent` | "Handed to the delivery channel." | "The firm has it" |
| `delivered` (with a receipt you verified) | "The firm's system stored it." | "The lawyer read it" |
| `acknowledged` | "Someone at the firm viewed it." | "They will take your case" |
| `responded` | "The firm replied." | "You have a lawyer" |
| `failed` | "It did not reach the firm." | Anything that sounds like delivery |

Verify every receipt (spec [section 5.5](/spec/0.1/#55-secure-transfer-handoffjson-receiptjson)). A tool result that says "delivered" without a verifiable receipt proves nothing.

## 5. Handle errors, not just success

Read [Errors](/docs/implementing/errors/) and [Recovery and no-match](/docs/implementing/recovery-and-no-match/). The ones your agent must handle: `OLIP_ONE_RECIPIENT_ONLY`, `OLIP_NOT_APPROVED`, `OLIP_AUTHORIZATION_STALE`, `OLIP_CONSENT_MISMATCH`, `OLIP_AUTHORIZATION_USED`, `OLIP_IDEMPOTENCY_KEY_REUSED`, `OLIP_POLICY_BLOCKED` (offer the `allowed_alternatives`), `OLIP_EVENT_SOURCE_FORBIDDEN`.

**Idempotency.** Send an `Idempotency-Key` (8 to 200 characters) with every submit. Retrying with the same key and body returns the same handoff and causes no second delivery.

**Revocation.** If the person changes anything after approving, the approval is stale; build a new preview and ask again. The person can withdraw at any time; after transmission the recipient may keep the copy it already has, and your agent must say so.

## 6. Optional 0.2 features

- **Key bindings** let you check that a receipt was signed by a key bound to the recipient you chose.
- **Signed status webhooks** push status changes; the status of record is still what `get_handoff_status` returns.
- **Intake capability cards** say what a firm accepts, with every item labeled as firm-reported or copied from an official record.

See [OLIP 0.2 additions](/spec/0.2/). An endpoint that offers only 0.1 is fully conformant to 0.1.
