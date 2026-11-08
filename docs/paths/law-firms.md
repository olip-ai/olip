---
id: law-firms
title: Path for law firms
description: How a law firm publishes self-reported intake eligibility, jurisdictions, languages and an intake capability card in OLIP, what it receives, and the limits - no paid ranking, no license certification.
---

# Path for law firms

**Pinned to:** OLIP 0.1, with the optional 0.2 intake capability card. You do not need to pay anyone, join anything or use any particular vendor. No firm runs OLIP in production today; this page explains what taking part means.

## What you publish

| Item | Where in OLIP | Labeled as |
|---|---|---|
| Who you are and your license | [Professional evidence](/docs/modules/professional-evidence/) | Official-source check (with source and date), or indexed only. Never a bare "verified" badge. |
| Matters, places, languages, client side, exclusions | [Intake eligibility](/docs/modules/intake-eligibility/) | Self-reported by you, with a date |
| Whether you are taking new matters | Intake policy `accepting_new_matters` | Self-reported, dated; capacity stays `unknown` unless you say otherwise |
| How a request reaches you | Intake policy `delivery` | Your own intake system (direct) or a vendor you choose |
| Intake capability card (optional, 0.2) | [OLIP 0.2, intake card](/spec/0.2/) | Each item marked firm-reported or copied from an official record; you can publish it on your own website |

See a fictional example: [intake capability card](pathname:///spec/0.2/examples/24-intake-capability-card.json) and [intake policy](pathname:///spec/0.1/examples/06-intake-policy.json).

## What you receive

- A request addressed to you alone, never a bulk send.
- Only the fields the person approved, with their exact values, and a list of what was withheld.
- A purpose (`request_initial_contact` or `request_consultation`) and the person's approval record.

## What you send back

- A signed receipt when your system stores the request. That proves storage, not that anyone read it.
- Optional events recorded by a person at your firm: acknowledged, responded, declined, consultation requested or confirmed, completed. Automatic replies never count.

## The limits

- **No paid ranking.** Payment never changes who is listed or the order (`paid_influence: false`).
- **Not license certification.** OLIP shows where license information came from and when. It does not certify competence or good standing.
- **Not a referral service and not legal advice.** A request through OLIP does not create an attorney-client relationship, and you decide whether to take any matter.
- **Your professional rules still apply**, including advertising, solicitation, conflicts and confidentiality. OLIP does not answer those questions for you; reference policy rules are illustrative and `pending_counsel_review`.

More: [What OLIP means for a firm](/docs/context/for-law-firms/) and [Legal and ethical boundaries](/docs/context/legal-and-ethical-boundaries/).

## See it working

[Try OLIP](/try/) shows a fictional firm receiving a request, signing a receipt and recording "acknowledged", all in your browser with no real lawyer contacted.
