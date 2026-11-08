---
id: security-review-scope
title: Security review scope
description: The public scope for an independent security review of OLIP and its reference implementation, the priority areas, and how findings are reported privately.
---

# Security review scope

**Status:** no independent security review has been done. This page is the scope the sponsor asks reviewers to use. An independent review is a gate before any real-client write traffic; it is **not** needed for the static site or the fictional [browser simulation](/try/).

## In scope

The specification ([0.1](/spec/0.1/), [0.2 additions](/spec/0.2/), [threat model](/spec/threat-model/)), the reference endpoints (`reference/`, `alt-python/`), the MCP adapter, the conformance suite, and this static website.

## Priority areas

| Area | Question |
|---|---|
| Authorization boundary | Can an agent or host approve on the person's behalf, or reuse, extend or widen an approval? |
| Content-digest binding | Can anything be sent that differs from what the person approved? |
| Replay and idempotency | Can a handoff be delivered twice, or an old webhook or receipt be replayed? |
| Signed receipts and callbacks | Can a receipt, recipient event or 0.2 webhook be forged, re-attributed or accepted unsigned? |
| Key rotation and binding (0.2) | Does a revoked or rotated key stop being trusted at the right time? |
| SSRF | Can callback or endpoint URLs make a host fetch internal addresses? |
| Cross-tenant leakage | Can one client, firm or person read another's CaseBriefs, previews or handoffs? |
| Recipient identity | Can a request reach someone other than the one named recipient? |
| Retention and deletion | Does deletion do what it says, and are the limits stated truthfully? |
| Secrets and dependency provenance | Are test credentials clearly fake and isolated? Are dependencies pinned and minimal? |
| Prompt injection | Is CaseBrief and firm-supplied text always treated as data, never as instructions? |

## Out of scope

Denial-of-service against olip.ai or its hosting, social engineering, physical attacks, and any test that touches real people or real firms.

## Reporting

Report privately to the [security contact](/security/). Do not open public issues or post findings in public. Unresolved findings are tracked privately; the sponsor publishes only a summary that the reviewer has agreed to, after a fix or a documented decision.
