---
id: legal-and-ethical-boundaries
title: Legal and ethical boundaries
description: OLIP is technical protocol information, not legal advice; it is not a referral marketplace, has no paid ranking, and does not create attorney-client relationships.
---

# Legal and ethical boundaries

:::info Not legal advice
This site provides technical protocol information. It is not legal advice, and using OLIP does not make any workflow lawful. Whether a particular workflow is a regulated lawyer referral, advertising, solicitation or fee sharing depends on the law of each jurisdiction and must be decided with qualified counsel.
:::

## What OLIP is not

- **Not a referral marketplace.** OLIP has no paid ranking, no paid placement and no lead pricing. Discovery order must be disclosed, and `paid_influence` must be `false`. A conforming implementation need not rank at all.
- **No referral fees in the sponsor's current products.** The initial sponsor's current releases charge no referral or per-lead fees and sell no matching position. Any future fee proposal by any company is a separate, jurisdiction-specific legal matter. It is not part of the protocol and does not affect the specification or conformance.
- **Not an endorsement.** A license record check is a record check. OLIP does not vouch for competence or quality.
- **Not representation.** Delivery, acknowledgment, a reply or a confirmed consultation is not acceptance of a matter and does not create an attorney-client relationship.
- **Not confidentiality or privilege by itself.** A message is not privileged or confidential merely because OLIP was used.
- **Not a regulator.** OLIP does not govern professional responsibility, and no bar, court, regulator, standards body, AI company or legal-aid organization has approved or endorsed it.

## Why the policy gate exists

The [policy gate](/spec/0.1/#7-jurisdiction-and-purpose-policy-gate-policy-gatejson) forces each host to state which workflow mode it is running (person picks a listed lawyer; direct firm intake; certified referral service; automated routing) and to check it per jurisdiction before anything is previewed or sent. The labels never remove legal obligations. Rule sets must be marked `counsel_approved` before production write traffic. **The rules shipped in the reference endpoints are illustrative only and have not been reviewed by counsel.**

## Consumer protections built into the protocol

- one named recipient per approval, chosen by the person;
- the exact fields and values shown before approval, and nothing else sent;
- expiry, revocation, export and deletion, each with honest limits;
- truthful status that never turns "stored" into "sent" or "sent" into "read";
- a no-match answer with free legal-help options instead of a forced handoff;
- a reminder that sending a request does not stop a legal deadline.
