---
id: legal-tech-vendors
title: Path for legal software vendors
description: Add OLIP to an intake or practice-management product - map existing states conservatively, integrate consent and signed receipts, run the public conformance suite, and keep the firm's decisions with the firm.
---

# Path for legal software vendors

**Pinned to:** OLIP 0.1 profiles `olip-read` and `olip-write`, optional 0.2. Free to implement; no account, fee or permission from the sponsor.

## 1. Start read-only

Expose the manifest, discovery, professional evidence and intake policy (`olip-read`). Check yourself with the [read-only example](/docs/paths/read-only-discovery/) and the conformance suite in fixture-free mode.

## 2. Map your states conservatively

Map each native state to the **most conservative OLIP state you can prove**, never a more hopeful one. Unmapped native states go in `extensions` only.

| Your product says | Map to | Not to |
|---|---|---|
| "Submitted" (stored, nothing sent) | `recorded` | `sent` |
| "Sent" (handed to email or a queue) | `sent` | `delivered` |
| "Received" (stored in the firm's system, receipt signed) | `delivered` | `acknowledged` |
| "Opened" by a person | `acknowledged` | `responded` |
| "Accepted" or "Engaged" | an `extensions` entry reported by the firm | any OLIP state |

Full rules: [Status lifecycle](/docs/modules/status-lifecycle/) and the [status machine](/spec/status-machine/).

## 3. Integrate consent and receipts

- Recompute the [consent digest](/spec/0.1/#54-consent-and-authorization-handoff-previewjson-authorizationjson) from the current CaseBrief at submit time; refuse a stale or mismatched approval.
- Accept only the approved fields; refuse anything extra.
- Sign receipts with Ed25519 over canonical JSON and publish keys at `/.well-known/olip-keys.json`. With 0.2, publish key bindings so agents can attribute receipts to the right firm.
- Treat CaseBrief text as untrusted user data, never as instructions (prompt-injection boundary).

## 4. Keep the firm's decisions with the firm

Your product may store, route and report. It may not accept a matter, record a human response, or imply representation on the firm's behalf. Recipient events come from the firm's people or its system, signed.

## 5. Secure the operational boundaries

Read [Privacy and security](/docs/implementing/privacy-and-security/) and the [threat model](/spec/threat-model/). Before any real client data: TLS 1.2+, encryption at rest for `olip-write`, tenant isolation, key rotation, retention and deletion, and an independent security review. No OLIP endpoint, including the sponsor's, has passed an independent review yet.

## 6. Run the suite and publish your result

[Test your implementation](/docs/contributing/self-test/), then [publish your result](/docs/contributing/publish-results/). Results are listed on equal terms on [Implementations](/implementations/). There is no certification and no badge.
