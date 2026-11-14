# Jurisdiction policy

Status: **under design, awaiting counsel review.** No jurisdiction is approved.

OLIP 2.0-draft gives no legal advice and decides no legal question. It does not decide whether someone is a prospective client, when an attorney-client relationship begins, what an engagement letter must contain, or how long records are kept. Those questions belong to applicable law and to the firm.

The protocol provides a **policy gate** so that a host cannot run lifecycle writes in a jurisdiction until counsel has approved the rules for it.

## The policy file

`policy/jurisdiction-rules.json` is reference policy only.

| Jurisdiction | Status | Open questions for counsel |
|---|---|---|
| US-CA | pending_counsel_review | Prospective-client duties for screening data; electronic engagement assent requirements; retention period for client communications |
| US-NY | pending_counsel_review | Prospective-client duties for screening data; engagement letter requirements; retention period for client communications |
| US-TX | pending_counsel_review | Prospective-client duties for screening data |
| Any other | not listed, so it fails closed | |

## Gate behavior

| Mode | Behavior | Status |
|---|---|---|
| `mock` | Lifecycle writes are allowed only for fictional data. Non-fictional data is refused | implemented, tested |
| `production` | Every lifecycle write is refused with `OLIP_POLICY_GATE_CLOSED` unless the matter's jurisdiction is `approved_by_counsel`. Unknown jurisdictions are refused | implemented, tested |

Test: `tenancy-ops` "policy gate: production mode refuses every lifecycle write". The production conformance target shows the gate closed: behavior checks are skipped, not faked.

## Fixed wording that does not depend on jurisdiction

- Sharing for screening "does not create an attorney-client relationship. The organization decides whether to take the matter."
- A firm-confirmed engagement is shown as "the firm's own signed report. OLIP does not create an attorney-client relationship; when one exists is decided by applicable law."
- An `unable_to_proceed` screening outcome shows only the firm's own polite text. It carries no reason codes that could read as legal conclusions.

This wording is **awaiting counsel review**.

## What counsel must approve before any jurisdiction opens

1. The consent notice text and its version (`notice_version`).
2. The prospective-client confidentiality treatment of screening data.
3. Whether one-time-code click assent is valid electronic assent for an engagement.
4. Retention, deletion and export rules for host copies.
5. Firm advertising and solicitation rules as they apply to firm-initiated messages.
6. Any state-specific limits on non-lawyer intermediaries in the relay topology.
