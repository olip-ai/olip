---
id: professional-evidence
title: Professional identity and evidence
description: How OLIP separates an indexed record, an official-source license check and a lawyer's own statements, each with source, date, freshness and uncertainty.
---

# Professional identity and licensing evidence

**Question:** who is this legal professional, and what is the evidence?

OLIP does not have a "verified lawyer" flag. It has **evidence with a level, a source and a date**, and a fixed sentence that says exactly that.

## Three evidence levels

| `verification.level` | Meaning | `checked_at` | Allowed wording (`display_statement`) |
|---|---|---|---|
| `indexed` | Copied from a dataset. Never checked against the licensing authority. | MUST be `null` | "Copied from … on <date>. Not checked against the official source." |
| `official_source_checked` | Compared with the licensing authority's own record. Includes the source URL and an evidence hash. | The date the **source** says its data is current, not the download date | "Checked against <source> on <date>: <status>." |
| `authority_issued_credential` | A credential signed by the licensing authority itself. | issuer's date | "Credential issued by <authority>." **None are known to exist today.** |

Rules that follow from this:

- Agents MUST show `display_statement` without upgrading it. An `indexed` record MUST NOT be called verified.
- A record is matched to a person by **jurisdiction plus license number**, never by name alone.
- Each source declares `freshness_days`. Past it, the status becomes `stale` and the statement says so.

## Four separate facts that are often blurred

| Fact | Field | Values |
|---|---|---|
| License evidence | `licenses[].verification` | levels above |
| Profile claim | `claim.status` | `unclaimed`, `claimed_unverified`, `claimed_verified`, `unknown` |
| Lawyer-reported information | `self_reported` | practice areas, languages, service territory, labeled as self-reported |
| Intake endpoint | `intake_endpoint.status` | `none`, `declared`, `conformance_tested`, `active`, `unhealthy` |

An indexed record is not a claimed profile, which is not an active endpoint, which is not a paying customer of anyone. `commercial.paid_placement` and `commercial.affects_order` MUST be `false` in OLIP results.

## Fictional examples

Official-source check (from [`04-identity-verified.json`](pathname:///spec/0.1/examples/04-identity-verified.json), shortened):

```json
{
  "jurisdiction": "US-CA",
  "license_id": "TEST-CA-100001",
  "status": { "value": "active", "status": "official_source_checked", "as_of": "2026-10-30T00:00:00-07:00" },
  "verification": {
    "level": "official_source_checked",
    "checked_at": "2026-10-30T00:00:00-07:00",
    "freshness_days": 120,
    "source": {
      "name": "Fictional US-CA licensing registry (test data)",
      "url": "https://registry.example.test/US-CA/TEST-CA-100001",
      "data_as_of": "2026-10-30T00:00:00-07:00",
      "evidence_sha256": "sha256:0000…0001"
    }
  },
  "display_statement": "Checked against the fictional US-CA registry on 2026-10-30: listed as active. This is a record check, not an endorsement."
}
```

Indexed only (from [`05-identity-indexed.json`](pathname:///spec/0.1/examples/05-identity-indexed.json)):

```json
{
  "status": { "value": "active", "status": "indexed_unverified", "as_of": "2026-10-02T00:00:00-07:00" },
  "verification": { "level": "indexed", "checked_at": null, "freshness_days": 120,
    "source": { "name": "Fictional bulk dataset (test data)", "url": "https://dataset.example.test/lawyers.csv", "evidence_sha256": null } },
  "display_statement": "Copied from a public dataset on 2026-10-02. Not checked against the official source."
}
```

## When the official source cannot be reached

If an official source is unavailable or blocks automated checks, keep the last evidence with its real date and let freshness expire it to `stale`. Do not convert an old check into a new one, and do not substitute a self-report for an official check. See [Recovery](/docs/implementing/recovery-and-no-match/).

Normative text: [spec 5.1](/spec/0.1/#51-professional-identity-and-licensing-evidence-professional-identityjson).
