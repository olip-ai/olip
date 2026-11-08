---
id: non-goals-and-limitations
title: Non-goals and known limitations
description: What OLIP deliberately does not do, and the known gaps in the 0.1 draft.
---

# Non-goals and known limitations

## Non-goals

OLIP is **not**:

- **A directory, ranking or matching algorithm.** A conforming implementation need not rank, recommend, or use anyone's matching logic. Discovery order must be disclosed and is never influenced by payment.
- **A lawyer referral service or marketplace.** Labels do not make a workflow lawful. Whether a workflow is a regulated referral, advertising, solicitation or fee sharing is decided by law and qualified counsel, never by this specification.
- **A credential or endorsement.** A license record check is a record check. OLIP does not certify competence, quality or good standing beyond what a cited source says on a cited date.
- **Legal advice or a legal decision-maker.** OLIP carries a person's own words and choices.
- **An attorney-client relationship, privilege or confidentiality.** Messages sent through OLIP may not be privileged or confidential merely because OLIP was used.
- **A replacement for MCP, A2A, OpenAPI, OAuth or HTTPS.** It is a semantic layer over them.
- **A promise of availability or response.** OLIP never states that a lawyer is available or will respond unless the recipient has said so, with a date.

## Known limitations of 0.1

These are open items in the [decision log](/governance/#decision-log) and [proposals](/spec/proposals/):

| # | Limitation | Consequence today |
|---|---|---|
| O-01 | Only one approval method (`hosted_otp`). Assistants that cannot send a user to a web page cannot approve. | Platform-attested approval is reserved for a later version. |
| O-02 | Signed status webhooks for relays are not defined. | Status is polled. |
| O-03 | No encrypted payload envelope (JWE) for relay transports. | Relays rely on TLS and at-rest encryption. |
| O-04 | No registry binding a recipient's signing key to its license record. | Impersonated firm endpoints remain a residual risk (threat T11). Needed before production. |
| O-05 | Document transfer is out of scope. | CaseBriefs carry document references only. |
| O-06 | Multi-professional firms and shared intake are not modeled. | One recipient = one professional or firm. |
| O-07 | No independent security review yet. | The threat model is the sponsor's own. |
| O-08 | No implementation by another organization yet. | Interoperability has been shown only between two implementations by the same author. |
| — | Jurisdiction rules in the reference are illustrative and `pending_counsel_review`. | Production write traffic MUST NOT run on them. |
| — | No SALI LMSS mapping has been made; every taxonomy entry is `unmapped_pending_review`. | Matter codes are OLIP's own starter list. |
| — | The A2A binding has not been tested against an official A2A SDK. | Treat it as experimental. |
