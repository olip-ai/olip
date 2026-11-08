---
id: quickstart
title: Quickstart
description: Run a complete fictional OLIP flow locally in under 30 minutes - discovery, evidence, CaseBrief, one-recipient preview, user approval, mock handoff, signed receipt, status, withdrawal and failure paths.
---

# Quickstart: a complete fictional handoff

:::warning Sandbox simulation only
Everything in this quickstart is fictional: the people, the firms, the license numbers (`TEST-…`) and the addresses (`.test` domains). The mock endpoint runs on your own computer and has **no outbound email or delivery of any kind**. Nothing you do here can reach a real lawyer.
:::

**Goal:** go from "I need a lawyer" to a delivered, receipted, fictional handoff, and see the failure and withdrawal paths, in under 30 minutes. **You need:** Node.js 20 or later. Python 3.10 or later is optional (for the second endpoint). No account, key, payment or sponsor service is involved.

:::note Timing is a target, not a measurement
On the sponsor's machine the whole run takes a few seconds after download. It has **not yet been timed with an outside developer** on a clean machine. If it takes you longer than 30 minutes, please [tell us where you got stuck](/community/#feedback).
:::

## 1. Download and start the mock endpoint (5 minutes)

Download [`olip-0.2-draft-kit.zip`](pathname:///downloads/olip-0.2-draft-kit.zip) (checksums on [Downloads](/spec/downloads/)) and unzip it. Then, in a terminal:

```bash
cd olip-0.2-draft
npm install          # installs the JSON Schema validator (ajv) only
npm start            # mock endpoint on http://127.0.0.1:8787 (fictional data)
```

The reference endpoint has no runtime dependencies beyond Node itself.

## 2. Run the walkthrough (2 minutes)

In a second terminal:

```bash
cd olip-0.2-draft
npm run walkthrough
```

The walkthrough is an agent written against the public HTTPS binding. It prints each step and **validates every response against the shipped JSON Schemas**, exiting with an error if anything does not match. It ends with:

```text
 Walkthrough complete: every step behaved as the draft requires.
 Reminder: this was a sandbox simulation. No real lawyer was contacted.
```

## 3. What each step shows

| Step | Operation | What to notice |
|---|---|---|
| 0 | `GET /.well-known/olip.json` | The manifest lists profiles and `supported_versions`. |
| 1 | `GET /olip/v0.1/providers?q=…` | The plain-English request is interpreted *with its unknowns listed*. The order is disclosed and `paid_influence` is `false`. |
| 1 | `GET /olip/v0.1/professionals/{id}` | The license carries `verification.level: official_source_checked` (fictional registry), a source URL, a date and a fixed `display_statement`. |
| 1 | `GET …/intake-policy` | "Accepting new matters" is `self_reported` with a date. Capacity is `unknown`, not guessed. |
| 1b | discovery in Wyoming | No fictional lawyer fits: the result is `no_match` with free legal-help options, not an empty page. |
| 2 | `POST /olip/v0.1/casebriefs/validate`, `POST /olip/v0.1/casebriefs` | Drafting and validating transmit nothing (`transmitted: false`). |
| 3 | `POST /olip/v0.1/handoff-previews` | A two-recipient preview is refused (`OLIP_ONE_RECIPIENT_ONLY`). The real preview names one recipient, every shared value, the withheld fields (`facts`), notices and a `consent_digest`. |
| 4 | submit without approval | Refused. An agent cannot invent an authorization. |
| 5 | approval page + code | The person approves on the host's own page with a code sent to their own inbox. In the mock, the script reads a fictional inbox (`/mock/inbox`) to play the person. A real agent cannot do this. |
| 6 | `POST /olip/v0.1/handoffs` with `Idempotency-Key` | State `delivered` with a receipt signed by the fictional firm's system. A retry with the same key returns the same handoff (`idempotent_replay: true`). A forged "accepted" receipt fails verification. |
| 7 | recipient event | A person at the fictional firm records `acknowledged`. Engagement stays `unknown`. The agent's attempt to record "consultation confirmed" is refused (`OLIP_EVENT_SOURCE_FORBIDDEN`). |
| 8 | `POST …/cancel` | Withdrawal after delivery: the effect is `withdrawal_notice_sent_recipient_may_retain_copy`, and the limits are stated. |
| 9 | offline firm | State `failed`, no receipt. Never shown as delivered. |
| 10 | `mode: referral_service` | Blocked by the illustrative policy gate (`OLIP_POLICY_BLOCKED`) with allowed alternatives: choose one listed lawyer, contact the firm directly, or legal aid. |
| 11 | `DELETE …/casebriefs/{id}` | Deleted, with the limit stated for copies already delivered. |

The underlying request and response bodies are the [fictional examples](/spec/downloads/#fictional-examples), for example [the preview](pathname:///spec/0.1/examples/08-handoff-preview.json) and [the signed receipt](pathname:///spec/0.1/examples/11-receipt.json).

## 4. Validate your own payloads (5 minutes)

Paste any OLIP object into the in-browser [schema validator](/validator/), which runs entirely in your browser against the published schemas. Or validate in code:

```js
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
for (const name of ["common", "casebrief"]) {
  ajv.addSchema(await (await fetch(`https://olip.ai/spec/0.1/schemas/${name}.json`)).json());
}
const validate = ajv.getSchema("https://olip.ai/spec/0.1/schemas/casebrief.json");
console.log(validate(myCaseBrief) ? "valid" : validate.errors);
```

Some schemas reference others (for example `handoff.json` references `common.json` and `status-event.json`); load the whole set from [`olip-0.1-schemas.zip`](pathname:///downloads/olip-0.1-schemas.zip) to be safe.

## 5. Run the conformance suite against your own endpoint (10 minutes)

```bash
npm run conformance -- --base http://127.0.0.1:8787
# 35 pass, 0 fail, 0 skip
```

Point `--base` at your own implementation once it exposes the [mock harness](/spec/0.1/#12-mock-harness-test-deployments-only) in a test deployment. For a production endpoint, use fixture-free read mode (`--fixtures`). A pass is a technical result only. See [Conformance checklist](/docs/implementing/conformance-checklist/).

## 6. Optional: a second, separate implementation

```bash
PORT=8788 python3 alt-python/olip_alt_server.py      # Python, standard library only
npm run walkthrough -- http://127.0.0.1:8788
npm run conformance -- --base http://127.0.0.1:8788  # 29 pass, 6 skip (A2A, and the five 0.2 checks: Python implements 0.1 only)
npm test                                             # everything, both endpoints
```

Both endpoints were written by the same author, so they are not yet independent implementations in the standards sense. See [Implementations](/implementations/).

## 7. Optional: use it from an MCP host

The agent-side MCP adapter works against any OLIP endpoint and deliberately has **no approve tool**:

```json
{ "command": "node", "args": ["reference/mcp-adapter.mjs"],
  "env": { "OLIP_BASE": "http://127.0.0.1:8787",
           "OLIP_CLIENT_ID": "cli_agent_a", "OLIP_CLIENT_SECRET": "test-secret-agent-a" } }
```

The client ID and secret are fictional test credentials printed by `GET /mock/fixtures`. They work only against your local mock.

## Next

- Read the [architecture](/docs/foundations/architecture/) and [actors and trust boundaries](/docs/foundations/actors-and-trust/).
- Read the [full 0.1 text](/spec/0.1/).
- Build your own endpoint: [Independent implementation](/docs/implementing/independent-implementation/).
