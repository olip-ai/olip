---
id: security-considerations
title: Security considerations
description: The security considerations chapter of OLIP 0.1 - normative minimum for olip-write, consent integrity, replay, status spoofing, prompt injection, key management and residual risks.
---

# Security considerations

This chapter summarizes the security-relevant requirements of OLIP 0.1 in one place. The normative list is [spec section 13](/spec/0.1/#13-security-and-privacy-requirements-summary); the detailed analysis is the [threat model](/spec/threat-model/). Where they differ, the spec text wins.

## Normative minimum for olip-write

1. Authenticate every write caller; authorize every object by owner (tenant). Other tenants get 404.
2. Never accept an approval asserted by the client or a model. Approval comes from the user's own channel and binds the consent digest.
3. Recompute the digest at submit. Approvals are single-use and short-lived.
4. Require idempotency keys on submit; protect approval codes against replay (limited tries, expiry).
5. Accept recipient events only from authenticated recipients; sign recipient-sourced events and receipts.
6. Treat CaseBrief text and tool outputs as untrusted data.
7. Keep case content out of logs and analytics: log method, route shape and status only; analytics hold operation names and coarse codes.
8. Data minimization: only approved fields leave the host; publish retention days; offer deletion and export.
9. Rate-limit discovery, approvals and submits, and watch for abuse.
10. Publish a vulnerability disclosure process.

## Consent integrity

The consent digest covers the version, recipient, CaseBrief id and revision, purpose, mode, every shared field with its value, and the notice version, over canonical JSON. Any edit after approval produces a different digest, so silent scope changes fail (threat T3). The approval page is served from the host's own origin and echoes the digest (T19).

## Replay and duplicates

`Idempotency-Key` on submit, per-tenant key storage, and single-use authorizations prevent duplicate delivery (T5). Key stores must survive restarts in production.

## Status spoofing

Only recipient credentials can record recipient events, transitions are strict, and recipient events and receipts are signed with Ed25519. A compromised recipient account can still lie; that is labeled as the recipient's statement (T6, T7).

## Prompt injection

Text fields are data. Servers never execute them; state changes only through typed operations (T8). Downstream language models must also treat payloads as data.

## Keys

Keys are published as JWKS with `kid`. **A rotation and revocation procedure is not yet written** (T17), and **no registry binds a firm's signing key to its license record** (T11, open item O-04). Both are needed before production use.

## Residual risks the 0.1 draft does not solve

End-to-end payload encryption, document transfer, key binding to license records, signed webhooks, accessibility review of the approval page, and an independent penetration test.

## Reporting

See [Security](/security/) for how to report a vulnerability in the specification or the reference code.
