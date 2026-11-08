---
id: casebrief
title: CaseBrief
description: The minimal, editable CaseBrief (also called a Matter Passport) - source statements versus AI inference, document references, nothing sent before authorization.
---

# CaseBrief

**Question:** what did the person say, in a form they can read, edit and take elsewhere?

A CaseBrief holds user-reported facts, objectives, location, matter, dates, parties, open questions and **references** to documents (never file content). Some products call this a Matter Passport; OLIP's term is CaseBrief.

## Properties that matter

- **Nothing is sent while drafting.** Creating, editing or validating a CaseBrief MUST NOT transmit anything (`transmitted: false`).
- **Revisions.** `revision` increases on every edit. An approval is bound to one revision; editing invalidates it.
- **Untrusted content.** `content_trust` is always `"untrusted_user_supplied"`. No implementation may treat CaseBrief text as instructions (prompt-injection defense).
- **Minimal.** Implementations SHOULD warn about unneeded sensitive data: government ID numbers, card numbers, health or immigration details.
- **Not for other uses.** CaseBrief content MUST NOT be used for marketing, model training, ranking or growth analytics without separate lawful authorization.
- **Portable.** `export_casebrief` returns the full CaseBrief in schema form. Delete removes it from the host and states the limits for copies already transmitted.

## Source statements versus AI inference

Each fact carries a `source`:

| `source` | Meaning |
|---|---|
| `user_reported` | The person said it. |
| `document_reference` | It comes from a document the person referenced (the document itself is not included). |
| `agent_summary_confirmed_by_user` | The agent summarized it and the person confirmed the summary. |

An agent's unconfirmed reading of the situation does **not** go into the CaseBrief as a fact. It belongs in the discovery `interpretation`, where every guess is marked `inferred` and every gap is listed as an unknown with a question to ask. Key dates carry a `certainty` (for example `user_reported`).

## Fictional example

From [`07-casebrief.json`](pathname:///spec/0.1/examples/07-casebrief.json):

```json
{
  "olip_version": "0.1",
  "id": "cbr_0OteMGJurjk7K7dF",
  "revision": 1,
  "content_trust": "untrusted_user_supplied",
  "client": { "name": "Sample User (fictional)", "email": "sample.user@example.test" },
  "location": { "jurisdiction": "US-CA", "county": "Fictional County" },
  "matter": { "code": "housing.landlord_tenant", "user_description": "Notice to leave" },
  "summary": "Fictional example: I received a 3-day notice from my landlord.",
  "facts": [{ "text": "Fictional: I have rented this unit for two years.", "source": "user_reported" }],
  "key_dates": [{ "label": "Date on notice (fictional)", "date": "2026-11-20",
                  "time_zone": "America/Los_Angeles", "kind": "deadline", "certainty": "user_reported" }],
  "documents": [{ "ref": "doc_local_1", "title": "Photo of notice (kept on device)", "label": "confidential", "shared": false }]
}
```

The schema forbids a `content` member on documents: a CaseBrief can never carry file bytes.

Normative text: [spec 5.3](/spec/0.1/#53-casebrief-casebriefjson).
