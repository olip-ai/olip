---
id: actors-and-trust
title: Actors and trust boundaries
description: The five OLIP roles, what each may and may not do, and where the trust boundaries lie.
---

# Actors and trust boundaries

| Role | Meaning | Can | Cannot |
|---|---|---|---|
| **User** | The person seeking legal help | Choose the recipient; approve one exact preview; cancel; export and delete their CaseBrief | Be impersonated by the agent |
| **Client (agent platform)** | Software acting for the user: an AI assistant, app or website | Discover; draft CaseBriefs; request previews; submit an approved handoff; read status | Approve; record recipient outcomes; send to more than one recipient per preview |
| **Host** | The OLIP endpoint that stores the CaseBrief, preview and handoff | Run the policy gate; send approval codes; record host and transport states | Report `delivered` without a recipient receipt |
| **Recipient** | One legal professional or firm and its intake system | Sign receipts; record `acknowledged`, `responded`, `declined`, consultation events | See other firms' handoffs; receive fields the user did not approve |
| **Transport** | A channel to a recipient without an OLIP endpoint (email, webhook) | Report acceptance or failure | Prove that a recipient received anything |

## Trust boundaries

1. **Agent ↔ user.** The agent is authenticated but never trusted to approve. Approval comes from a surface the agent cannot complete alone (0.1: `hosted_otp`, a code sent to the user's own contact address). The approval is bound to a consent digest.
2. **Agent ↔ host.** Every write call is authenticated (OAuth 2.0 client credentials, short-lived tokens). Every object is authorized by owner; other tenants get `404`.
3. **Host ↔ recipient.** Recipient credentials are separate from client credentials. Recipient events and receipts are signed with keys published at the recipient's `/.well-known/olip-keys.json`.
4. **Content ↔ instructions.** CaseBrief text, profile text and tool outputs are **untrusted data** (`content_trust: "untrusted_user_supplied"`). No implementation may treat them as instructions. This is the prompt-injection boundary.
5. **Public site ↔ sensitive systems.** Documentation sites, including olip.ai, never host CaseBriefs, client files or endpoints with real data.

## Four things OLIP never infers from one another

| Concept | Who establishes it | In OLIP |
|---|---|---|
| User consent | The user, on the approval surface | `authorization` bound to a `consent_digest` |
| Platform authorization | The client's credentials | OAuth token. Never a substitute for consent. |
| Attorney acceptance of a matter | The recipient, outside OLIP | Only as a recipient-reported, signed extension. `engagement.status` stays `unknown` otherwise. |
| Attorney-client relationship | Law and the parties | Never created or represented by OLIP |

The full threat analysis is in the [threat model](/spec/threat-model/).
