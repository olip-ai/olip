---
id: privacy-and-security
title: Privacy and security for implementers
description: The OLIP 0.1 security model and the developer checklist for olip-write endpoints - authentication, consent, transfer, status truth, data protection and operations.
---

# Privacy and security for implementers

The normative minimum is in [spec section 13](/spec/0.1/#13-security-and-privacy-requirements-summary) and [Security considerations](/spec/security-considerations/). The full analysis is the [threat model](/spec/threat-model/). This page is the practical checklist.

:::caution Not independently reviewed
The threat model and checklist were written by the sponsor. No independent security practitioner has reviewed them yet. To report a problem, see [Security](/security/).
:::

## Checklist

Use before you call an endpoint `olip-write` in production. Each line maps to the spec or a conformance check (W#).

**Identity and auth**
- [ ] Every write call authenticated (client credentials, 15-minute tokens or shorter). W1, W14
- [ ] Objects authorized by owner; other tenants get 404, never 403. W15
- [ ] Recipient credentials separate from client credentials; a recipient sees only its own handoffs. W11
- [ ] Secrets compared in constant time; stored hashed; rotated.

**Consent**
- [ ] No operation lets a client or model approve. The user approves on your page with a code to their own channel. W4
- [ ] Preview shows one recipient, every shared value, withheld fields, notices and the consent digest. W3
- [ ] Digest recomputed at submit from the current CaseBrief; approvals single-use and short-lived. W5, W6, W14
- [ ] `selection.by: "user"` honored; automated routing blocked unless counsel-approved. W12

**Transfer**
- [ ] `Idempotency-Key` required on submit; keys persisted. W7, W20
- [ ] Only approved fields leave the host. W18
- [ ] Receipts signed (Ed25519, canonical JSON); JWKS published; `kid` rotation plan. W10
- [ ] Transport acceptance recorded as `sent`, never `delivered`. W9
- [ ] Failures recorded as attempts, then `failed`. W8

**Status truth**
- [ ] Only allowed transitions from allowed sources; evidence required. W11, W21
- [ ] Automatic replies never count as acknowledged. W10
- [ ] Engagement never inferred.

**Data protection**
- [ ] Case text, names and emails never in logs, analytics, error trackers or growth events. W16
- [ ] CaseBrief text treated as data in every downstream system, including LLM prompts. W17
- [ ] Retention days published; export and delete work and state their limits. W13
- [ ] Encryption at rest for CaseBriefs and payloads; TLS 1.2+ in transit.
- [ ] No real client data in any test, demo, mock or fixture. Use `.test` domains and `TEST-` license numbers.

**Operations**
- [ ] Rate limits on discovery, approvals (5 tries) and submits.
- [ ] Mock hooks (`/mock/*`) absent from production builds.
- [ ] Vulnerability disclosure contact published; incident runbook tested.
- [ ] Gate rules for each jurisdiction marked `counsel_approved` before production write traffic.

## Prompt injection

CaseBrief text, profile text, document text and tool outputs are untrusted. State changes happen only through typed operations. Downstream language models that read payloads must treat them as data. Check W17 stores an injection attempt as plain data and verifies it changes nothing.
