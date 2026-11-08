---
id: consent-and-authorization
title: Consent and authorization
description: One named recipient, exact fields, purpose, notices, expiry and a consent digest; only the user approves; how this differs from agent credentials and the proposed Agent Connection Mandate.
---

# Consent and authorization

**Question:** which one recipient may receive which exact fields, for what purpose, until when, and who said yes?

## The preview

Before anything is sent, the host produces a **preview** that names:

- **exactly one recipient** (bulk previews are refused with `OLIP_ONE_RECIPIENT_ONLY`);
- every **shared field with its exact value**, and the **withheld fields**;
- the **purpose** (`request_initial_contact` or `request_consultation`) and **mode**;
- **notices** with a `notice_version` (not an attorney-client relationship; may not be privileged; does not stop deadlines; only this recipient);
- the **policy gate** result;
- a **consent digest**.

```text
consent_digest = "sha256:" + hex(SHA-256(canonical_json({
  olip_version, recipient_id, casebrief_id, casebrief_revision,
  purpose, mode, shared_fields: [{path, value}] sorted by path, notice_version })))
```

Fictional example: [`08-handoff-preview.json`](pathname:///spec/0.1/examples/08-handoff-preview.json). You can compute a digest yourself in the [validator](/validator/#consent-digest).

## Only the user approves

The user approves on a surface the agent cannot complete alone. OLIP 0.1 defines one method, `hosted_otp`: the host shows the preview on its own page, sends a one-time code to the user's own contact address, and the page echoes the consent digest.

The resulting **authorization** ([`authorization.json`](pathname:///spec/0.1/schemas/authorization.json)) is:

- **single-use** (`single_use: true`);
- **short-lived** (the reference uses 30 minutes; approval codes: 6 digits, 10-minute expiry, 5 tries);
- **bound to the digest.** Any change to the recipient, a shared value, the purpose, the mode, the notices or the CaseBrief revision changes the digest, so the old approval fails with `OLIP_AUTHORIZATION_STALE` or `OLIP_CONSENT_MISMATCH`.

Hosts MUST recompute the digest from the current CaseBrief at submit time. The user, or the agent on the user's instruction, can revoke a preview before submit (`OLIP_AUTHORIZATION_REVOKED` afterward).

## Agent credentials are not consent

| | Platform authorization | User consent |
|---|---|---|
| What | OAuth 2.0 client credentials for the agent platform | One approval for one preview |
| Proves | Which software is calling | That the person said yes to this exact content and recipient |
| Scope | Discover, draft, preview, submit an approved handoff, read status | One recipient, listed fields, one purpose, until expiry |
| Can it send case data? | **No**, not by itself | Yes, exactly once |

A generic permission such as "let my assistant find me a lawyer" can never serve as blanket approval to contact firms.

## Proposed: the Agent Connection Mandate

:::caution Proposal, not part of OLIP 0.1
The mandate below is a **design proposal** (P-01 on [Proposals](/spec/proposals/)). It has no schema in 0.1 and no conformance test. It does not change any 0.1 requirement.
:::

Some agent platforms need a way to record what a person has allowed the assistant to do **before** any recipient is chosen, without weakening the per-recipient approval above. The proposal is a separate, revocable, expiring object with least-privilege scopes:

| Proposed scope | Allows | Never allows |
|---|---|---|
| `olip:discover` | searching and reading evidence and intake policies | contacting anyone |
| `olip:casebrief.prepare` | drafting and validating a CaseBrief locally or on the host | transmitting it |
| `olip:handoff.status` | reading status of handoffs the person already approved | recording recipient events |

Transmission stays outside any mandate: every transmission still needs the per-recipient, per-field approval bound to a consent digest. Illustrative shape (not normative, not validated by any 0.1 schema):

```json
{
  "mandate_id": "mdt_example",
  "subject": "the person, as identified by the agent platform",
  "agent": "cli_agent_a",
  "scopes": ["olip:discover", "olip:casebrief.prepare", "olip:handoff.status"],
  "transmission_allowed": false,
  "expires_at": "2026-12-01T00:00:00Z",
  "revocable": true
}
```

Normative text for 0.1: [spec 5.4](/spec/0.1/#54-consent-and-authorization-handoff-previewjson-authorizationjson).
