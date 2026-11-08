---
id: proposals
title: Proposals and open questions
description: Design proposals and open items for OLIP versions after 0.1 - platform-attested approval, connection mandates, signed webhooks, JWE envelopes, key binding, documents, firms.
---

# Proposals and open questions

Nothing on this page is part of OLIP 0.1. Items marked as in 0.2 are now specified in the [0.2 additions](/spec/0.2/). Each item is open for comment. A proposal becomes normative only with a schema change, a conformance test and an example, after public comment.

| # | Topic | Problem | Direction under discussion |
|---|---|---|---|
| O-01 | Platform-attested approval | Some assistants cannot send a person to a web page to approve. | An approval signed by an agent platform's published key, without letting the agent approve alone (threat T1 must not weaken). Reserved name: `platform_attestation`. |
| P-01 | Agent Connection Mandate | Platforms need to record what the assistant may do before a recipient is chosen. | A scoped, expiring, revocable mandate for discovery, CaseBrief preparation and status reading only; transmission always stays per-recipient. See [Consent and authorization](/docs/modules/consent-and-authorization/#proposed-the-agent-connection-mandate). |
| P-02 | Readiness, capability cards, handoff (**card adopted in [0.2](/spec/0.2/)**) | People arrive unprepared; assistants cannot tell how an office takes inquiries; offices retype approved inquiries. | A portable readiness checklist, a signed firm-published intake capability card (no scores; firm facts labeled not verified; free for every firm), an approved handoff package and five new states. See [P-02](/spec/proposal-p02/). |
| O-02 | Signed status webhooks (**in [0.2](/spec/0.2/)**) | Relays and clients poll for status today. | Signed, replay-protected webhook events with the same evidence rules. |
| O-03 | Encrypted payload envelope | Relay transports see payloads in the clear inside TLS. | JWE envelope to the recipient's key. |
| O-04 | Key binding (**format in [0.2](/spec/0.2/)**) | Nothing binds a firm's signing key to its license record and identity (threat T11). | A registry or signed statement linking `kid` to a professional and an evidence source. Required before production. |
| O-05 | Document transfer | CaseBriefs carry references only. | A separate, explicitly approved document transfer with its own digest. |
| O-06 | Firms with many professionals | One recipient is one professional or firm today. | Shared intake with per-professional routing visible to the person. |
| O-07 | Independent security review | The threat model is the sponsor's own. | Recruit an outside reviewer. |
| O-08 | Independent implementation | Both implementations have the same author. | An implementation by a different organization. |
| O-09 | Second license with unknown number (CR-07) | A license entry cannot say "this state, number unknown". | Allow `license_id: null` with `status: unknown` in 1.0. Until then, leave the entry out and state it in `unknowns`. See [0.2, section 7](/spec/0.2/#7-changes-from-implementer-feedback). |
| — | SALI LMSS mapping | Starter matter codes are unmapped. | Map codes against a named LMSS release, with exact or broader or narrower status. |
| — | Key rotation and revocation | Procedure not written (threat T17). | Publish a rotation and revocation procedure with overlap windows. |

To comment, see [Community](/community/#feedback).
