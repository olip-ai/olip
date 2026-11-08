---
id: status-lifecycle
title: Status lifecycle
description: The fifteen OLIP handoff states, what each proves and does not prove, who may record each transition, and the evidence required.
---

# Status lifecycle

**Question:** what actually happened, stated without overstatement?

## What each state proves

| State | What it proves | What it does NOT prove |
|---|---|---|
| `draft` | A preview exists | Approval or transmission |
| `approved` | The user approved this exact content | Anything was transmitted |
| `recorded` | The host stored it and is holding it | Anything left the host |
| `queued` | Scheduled; attempts may have failed | Any channel accepted it |
| `sent` | A transport accepted it | It reached the firm's system |
| `delivered` | The firm's intake system stored it and signed a receipt | A person read it |
| `acknowledged` | A person at the firm recorded viewing it (automatic replies never count) | The firm will take the matter |
| `responded` | A person sent a substantive reply | Acceptance |
| `consultation_requested` | The firm asked to schedule | A time is set |
| `consultation_confirmed` | The firm confirmed a time | An attorney-client relationship |
| `completed` | The firm recorded that the consultation happened | Engagement or outcome |
| `declined` | The firm said no | Anything about the merits |
| `cancelled` | The user (or the recipient) withdrew | That the recipient deleted a copy |
| `failed` | Delivery attempts were exhausted | — |
| `expired` | Time ran out before the next step | — |

**Technical delivery is never legal representation.** `engagement.status` stays `unknown` unless the recipient reports otherwise in a signed extension.

A policy refusal before any preview is **not** a state: it is an error (`OLIP_POLICY_BLOCKED`) and no handoff exists.

## Who may record what

| Source | May record |
|---|---|
| `user` | approved; cancelled |
| `client` (the agent platform) | cancelled, on the user's instruction |
| `host` | recorded, queued, failed, expired |
| `transport` | sent, failed |
| `recipient_system` | delivered (with a signed receipt); consultation requested or confirmed |
| `recipient_human` (via the recipient's authenticated system) | acknowledged, responded, declined, consultation requested or confirmed, completed, cancelled |

The calling agent can never record recipient outcomes (`OLIP_EVENT_SOURCE_FORBIDDEN`). Anything not in the transition table is refused (`OLIP_INVALID_TRANSITION`), and recipient events need evidence (`OLIP_EVIDENCE_REQUIRED`). Every event records `from_state`, `to_state`, `occurred_at`, `recorded_at`, `source`, `actor`, `evidence`, and a signature when the source is the recipient.

The complete transition table with sources and evidence is on [Status machine](/spec/status-machine/).

## Adapters with fewer states

Map each native state to the **most conservative OLIP state that is proven**, and expose unmapped native states only as `extensions`. Example: a system that says "submitted" when it has only stored a message maps to `recorded`, not `sent`.

Normative text: [spec 5.6](/spec/0.1/#56-outcome-status-status-machinejson-status-eventjson).
