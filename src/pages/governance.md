---
title: Governance
description: OLIP sponsorship, maintainers, editorial process, conformance and mark rules, licensing and IP, conflicts of interest, decision log and the proposed path to independent governance.
---

# Governance

## Sponsorship

**OLIP was initiated and is initially sponsored by Digital Crossings Inc. The specification is proposed and open to independent contributors.**

There is no foundation, standards body, council, external governing member, or partner endorsement today. No bar association, court, regulator, AI company or legal-aid organization has approved or endorsed OLIP.

Products associated with the sponsor may adopt OLIP like anyone else. They do not control access to the standard: anyone may implement OLIP and run the conformance suite without paying Digital Crossings Inc., using any sponsor product, or holding an account.

## Maintainers

| Role | Who |
|---|---|
| Editor of the draft | The initial sponsor, Digital Crossings Inc. |
| Independent maintainers | None yet |

The 0.1 draft, the 0.2 additions, schemas and reference code were prepared for the sponsor with AI-assisted engineering. No outside party has reviewed them yet.

## Project background

OLIP grew out of the sponsor's own engineering work on how AI assistants can help a person contact a lawyer honestly. That work found recurring problems across the industry: copied records shown as "verified", vague consent, and messages reported as "sent" or "delivered" when they had only been stored. OLIP 0.1 (2026-11-06) generalizes the fixes into a vendor-neutral draft.

## Conformance and mark rules

Draft rules:

1. **Objective:** only the published suite decides. Anyone may run it; results are reproducible JSON.
2. **Nondiscriminatory:** the same tests and terms for every implementer, including competitors and firms that pay no one. No fee to self-test.
3. **Truthful display:** show profile, version, suite version and date, e.g. "Supports OLIP 0.1 (read, write). Self-tested 2026-11-06." Never "OLIP certified lawyer", "approved", "verified by OLIP", or a badge next to a lawyer's name that implies vetting.
4. **Separate claims:** technical conformance, identity evidence level and jurisdiction permissions are three different statements.
5. **Expiry:** a self-test result is current for 90 days or until a new suite version.
6. **Withdrawal:** misleading use may be asked to stop; the implementer may appeal.
7. **No paid ranking:** no implementation may give conforming endpoints, or the sponsor's customers, preferential discovery order.

## Name and trademark

"OLIP" (Open Legal Intake Protocol) is the name of the standard. The olip.ai domain was registered by the sponsor on 2026-11-07, and the sponsor states the name is cleared for use (2026-11-07). No trademark registration is claimed. The sponsor holds the name until an independent body exists and licenses it free for truthful conformance statements.

## Licensing and IP

Granted 2026-11-07: CC BY 4.0 with the OWFa 1.0 patent commitment for the specification and schemas, Apache 2.0 for code, CC0 for fictional examples. See [Licensing](/license/).

## Proposed independent governance

:::note Proposal only
No council exists. Nobody has been asked to serve or has accepted a seat.
:::

**Purpose.** Steward the specification, schemas, conformance suite and name so that any agent, firm, vendor or legal-aid group can implement OLIP freely and on equal terms.

**Proposed seats (7, starting structure):** practicing lawyer (solo or small firm); practicing lawyer (legal aid or public interest); independent AI agent developer; legal software vendor; consumer or legal-aid advocate; security or standards expert; the sponsor (one seat, non-chair). Two-year staggered terms; the chair is elected, and the sponsor may not chair for the first two terms.

**Separation.** Commercial sponsor decisions (pricing, products, advertising) are never council business, and council decisions never favor any vendor.

### Proposed decision rules

- Editorial changes: lazy consensus on a public tracker after 7 days.
- Normative changes: public proposal, at least 14 days of comment, then a vote that passes with 5 of 7 seats and at least 3 non-sponsor, non-vendor seats in favor.
- Conformance-rule changes need two independent implementers to confirm testability.
- Every decision recorded with its rationale.

### Conflicts of interest

Members disclose employers, clients, investments and paid relationships with any implementer, publicly, before voting. Conflicted members abstain on matters that specifically affect that party. The sponsor's commercial interest in its own products is disclosed here.

### Appeals

Any implementer may appeal a conformance or mark decision within 30 days to two members not involved in the original decision. Unresolved disputes go to a neutral mediator agreed in advance.

### Path to independent governance

When at least five independent organizations run conforming implementations in production, the council evaluates moving the specification and the name to a neutral foundation, and the sponsor transfers the name on agreed terms.

## Decision log

| # | Date | Decision | Why |
|---|---|---|---|
| D-01 | 2026-11-06 | OLIP defines legal semantics only; reuse HTTPS, OAuth 2.0, JWKS/Ed25519, JSON Schema, OpenAPI, MCP, A2A | Fewer things to trust |
| D-02 | 2026-11-06 | Two topologies (direct, relay); `delivered` requires a recipient-signed receipt | Stops "stored" or "emailed" being reported as delivered |
| D-03 | 2026-11-06 | Only user approval method in 0.1 is `hosted_otp`; `platform_attestation` reserved | The client must never be able to approve alone |
| D-04 | 2026-11-06 | `recorded` state added before `queued` | Distinguishes "stored and held" from "scheduled" |
| D-05 | 2026-11-06 | No ranking in the standard; discovery order disclosed with `paid_influence: false` | Neutrality |
| D-06 | 2026-11-06 | Reference jurisdiction rules are illustrative and `pending_counsel_review`; production write traffic needs `counsel_approved` | No legal conclusion without counsel |
| D-07 | 2026-11-06 | SALI LMSS mapping left empty (`unmapped_pending_review`) | Invented IRIs would be false data |
| D-08 | 2026-11-06 | Schema ids use the placeholder `spec.olip.invalid` | No domain owned at the time |
| D-09 | 2026-11-07 | Schema ids move to `https://olip.ai/spec/0.1/schemas/` | olip.ai registered; schemas, validator and conformance updated together and retested |
| D-10 | 2026-11-07 | Publish documentation at olip.ai as a static site with no analytics | Open access with minimal visitor data |
| D-11 | 2026-11-07 | Licenses granted: CC BY 4.0 with the OWFa 1.0 patent commitment (specification, schemas), Apache 2.0 (code), CC0 1.0 (fictional examples) | Granted by the sponsor on 2026-11-07 |
| D-12 | 2026-11-07 | The name "OLIP" is cleared for use, per the sponsor; no trademark registration is claimed | Sponsor statement |
| D-13 | 2026-11-07 | OLIP 0.2 adds key bindings, signed status webhooks and the intake capability card; nothing in 0.1 changes | Additive, so 0.1 clients keep working |
| D-14 | 2026-11-07 | OLIP is offered to MCP clients as an "OLIP over MCP" profile, not as an MCP extension | MCP stays a transport; OLIP keeps its own versioning |
| D-15 | 2026-11-07 | Implementer change requests CR-01 to CR-06, CR-08 and CR-09 adopted in 0.2; CR-07 deferred to 1.0 | A read adapter for a sponsor-associated product found checks that tested the mock's behavior, not 0.1 rules. The 0.1 files are not edited, so published hashes stay valid |
