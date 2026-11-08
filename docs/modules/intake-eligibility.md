---
id: intake-eligibility
title: Intake eligibility
description: The firm-controlled intake policy - jurisdictions, matter types, client side, languages, capacity, exclusions, required fields, retention and freshness.
---

# Intake eligibility

**Question:** what does this professional say they accept, and how fresh is that statement?

The intake policy is **the professional's own statement**, controlled by the firm, with a timestamp. It is not a legal conclusion, an endorsement, or a promise of availability.

## Fields

| Field | Meaning |
|---|---|
| `jurisdictions` | Where the professional accepts matters (ISO 3166-2 style, e.g. `US-CA`) |
| `matter_types` | OLIP matter codes, each with a `sali` block (currently `unmapped_pending_review`) |
| `client_side` | e.g. `tenant`, `landlord` |
| `languages` | BCP 47 language tags |
| `accepting_new_matters` | a `knownValue`: value, status (usually `self_reported`), `as_of` |
| `capacity` | a `knownValue`; `unknown` is a valid and honest answer |
| `accessibility` | a `knownValue`; may be `not_provided` |
| `exclusions` | matters or situations not accepted |
| `required_fields`, `optional_fields` | which CaseBrief paths the firm needs or accepts |
| `delivery` | `topology` and `receipt` type (e.g. `signed_EdDSA`, `transport_only`) |
| `regulatory.modes_allowed` | which modes the firm accepts |
| `retention_days` | how long the firm keeps a handoff |
| `deadlines_note` | a plain reminder that sending does not stop a legal deadline |
| `updated_at`, `stale` | when the firm last updated it, and whether it is past freshness |

## Rules

- **No invented availability.** If the firm has not said it is accepting new matters, the value is `unknown`. Implementations MUST NOT turn a listing into "available now".
- **Actual timestamps.** `updated_at` is when the firm changed the policy, not when a crawler last saw it.
- **Practice fit is self-reported.** A matter type in the policy is the firm's statement, not a certification of expertise.
- **Required fields drive the preview.** A host refuses a preview that is missing a required field (`OLIP_REQUIRED_FIELD_MISSING`) or includes one the firm does not accept (`OLIP_FIELD_NOT_ACCEPTED`).

Fictional example: [`06-intake-policy.json`](pathname:///spec/0.1/examples/06-intake-policy.json). Normative text: [spec 5.2](/spec/0.1/#52-intake-policy-and-eligibility-intake-policyjson).
