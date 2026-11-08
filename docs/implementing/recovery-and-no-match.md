---
id: recovery-and-no-match
title: Recovery, no-match and urgent matters
description: What an OLIP implementation does when nothing fits, an official source is unavailable, an endpoint is unreachable, or the matter is time-sensitive.
---

# Recovery, no-match and urgent matters

OLIP must never push a lawyer handoff where none fits or none is needed. Every dead end returns a person-controlled next step.

| Situation | Required behavior | Where |
|---|---|---|
| **No professional fits** | Say so (`no_match` with a reason and message) and SHOULD return free legal-help options (`legal_aid_options`). Never pad results with poor fits. | spec §6; check R7 |
| **Official source unavailable or blocks checks** | Keep the last evidence with its real date; let `freshness_days` turn it `stale`; never relabel an old or indexed record as checked. | spec §5.1 |
| **Recipient has no intake endpoint** | The policy gate blocks with `recipient_has_no_intake_endpoint` and returns `contact_directly` (the firm's public phone or website). | spec §7 |
| **Endpoint unreachable** | Submit succeeds as `queued`, then `failed` after `max_attempts`. Never `delivered`. Tell the person, and offer direct contact. | spec §5.5; check W8 |
| **Workflow not allowed in the jurisdiction** | `OLIP_POLICY_BLOCKED` with at least one `allowed_alternatives` entry (another mode, direct contact, legal aid, a certified referral service). | spec §7; check W12 |
| **Approval expired or content changed** | Ask the person again with a new preview; old approvals fail (`OLIP_AUTHORIZATION_EXPIRED`, `_STALE`, `OLIP_CONSENT_MISMATCH`). | spec §5.4 |
| **Person withdraws** | Cancel; state the effect and limits truthfully. | spec §5.5; check W13 |

## Time-sensitive matters

OLIP does not detect emergencies and does not set deadlines. Implementations should:

- show the intake policy's `deadlines_note` and the preview notice: **sending a request does not stop any legal deadline**;
- keep key dates in the CaseBrief with their `certainty`;
- for a court date, detention, or danger to safety, put direct options (court self-help, legal aid, emergency services) **before** any handoff, and never make the person wait on a status change.

## Consumer-controlled alternatives

Every alternative is a choice the person makes: call or visit the firm directly, contact a court self-help center, contact legal aid, or use a lawfully certified lawyer referral service where one exists. OLIP fixtures use fictional examples only; implementers choose and verify real resources for their jurisdictions.
