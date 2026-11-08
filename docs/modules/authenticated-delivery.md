---
id: authenticated-delivery
title: Authenticated delivery
description: Idempotent, authenticated submission of only the approved fields; signed Ed25519 receipts; replay resistance; honest failure; cancellation; privacy-safe logging and retention.
---

# Authenticated delivery

**Question:** how do only the approved fields get to one recipient, once, with proof?

## Submit

`POST /olip/v0.1/handoffs` with `{authorization_id, consent_digest}` and an **`Idempotency-Key`** header (8 to 200 characters).

| Situation | Result |
|---|---|
| Same key, same body | Same handoff, `idempotent_replay: true`, no new delivery |
| Same key, different body | `OLIP_IDEMPOTENCY_KEY_REUSED` |
| Used authorization, new key | `OLIP_AUTHORIZATION_USED` |
| No key | HTTP 428, `OLIP_IDEMPOTENCY_KEY_REQUIRED` |
| Recipient unreachable | Submit succeeds; state `queued` or `failed`, never `delivered` |

Only approved fields leave the host, as `payload`, with `payload_sha256`.

## Receipts

A direct or receipt-capable recipient signs:

```text
{receipt_id, handoff_id, recipient_id, received_at, payload_sha256, consent_digest, retention_days, statement}
```

with **Ed25519 over canonical JSON**. Public keys are published at the recipient's `/.well-known/olip-keys.json` (JWKS, `kid` rotation). Clients SHOULD verify the signature, the consent digest and the payload hash. A tool response that says "delivered" without a verifiable receipt proves nothing.

Fictional receipt: [`11-receipt.json`](pathname:///spec/0.1/examples/11-receipt.json). Its `statement` reads: "Stored by the recipient's intake system. This is not proof that a person has read it, and not acceptance of the matter."

## Attempts and failure

Delivery attempts are recorded with their outcome. After `max_attempts` failures the handoff is `failed`. Transport errors MUST NOT be reported as delivered. A relay over email reaches `sent` at most, unless the recipient's system returns a receipt.

## Cancel and withdrawal

`POST /olip/v0.1/handoffs/{id}/cancel`:

- before transmission: effect `not_transmitted`;
- after transmission: effect `withdrawal_notice_sent_recipient_may_retain_copy`, with the limits listed;
- terminal states cannot be cancelled (HTTP 409).

## Transport security and logging

- TLS 1.2 or later in production; encryption at rest for CaseBriefs and payloads in `olip-write` production deployments.
- Logs hold method, route shape and status only. Analytics hold operation names and coarse codes. Case content, names and emails never go into logs, analytics or error trackers.
- Retention is published (`retention_days`); export and delete are available and state their limits.

Normative text: [spec 5.5](/spec/0.1/#55-secure-transfer-handoffjson-receiptjson).
