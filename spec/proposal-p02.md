---
id: proposal-p02
title: "P-02: Consultation readiness, intake capability cards and intake handoff"
sidebar_label: "P-02: Readiness, cards, handoff"
description: Proposed (not part of OLIP 0.1) - a portable consultation readiness checklist, a firm-published signed intake capability card, an approved intake handoff package, and five more status values.
---

# P-02: Consultation readiness, intake capability cards and intake handoff

<span class="status status--draft">DRAFT</span> **Proposed.** Not part of OLIP 0.1. Nothing on this page is normative. It is open for [comment](/community/#feedback) and becomes part of a later version only with a schema change, a conformance test and an example, after public comment (see [Versioning](/spec/versioning/)).

:::tip Adopted in part
The intake capability card (section 2) is now normative in [OLIP 0.2](/spec/0.2/) as `olip-intake-capability-card/0.2`. Readiness, handoff and the new states remain proposals.
:::

Three rules hold for everything below:

1. **A capability card is not a quality rating.** It holds no score, rank, response rate, win rate or payment status, and the schema refuses such fields.
2. **Firm-reported facts are not verified.** Each one is dated and labeled as the firm's own statement, kept apart from facts copied from a licensing authority.
3. **The card is free for every firm.** Publishing, reading or validating a card needs no account, subscription or payment with any host, including the initial sponsor.

## Why

OLIP 0.1 ends when a professional acknowledges or answers an inquiry. Three gaps remain:

- People arrive unprepared, and apps invent "case strength" scores to fill the gap.
- An assistant cannot tell, before sending, whether an office takes inquiries this way, in which matters and states, or what it does on receipt.
- An office that accepts an inquiry retypes it into its own system, and nothing records which fields the person approved.

## 1. Consultation readiness

`olip-consultation-readiness/0.1-draft`. A document the person keeps and shares only when they choose. The host keeps no copy.

| Field | Meaning |
|---|---|
| `checklist[]` | `{id, label, why, status: answered or missing, answer, label_of_answer}` |
| `readiness` | `{answered, total, percent, definition}`. Checklist completion only. A conforming app MUST NOT present it as the likelihood of a case, a win or acceptance. |
| `timeline[]` | Each date carries its `source` (`user_reported`, `document_derived`, ...) and an `uncertain` flag. |
| `documents_to_gather[]`, `consultation_questions[]` | Preparation lists. |
| `published_terms` | Only terms a professional published, with source and date. Never estimated. |
| `urgent_notice` | Present when a listed date falls within 7 days. The app shows it first. |
| `left_out` | Kinds of ID-like numbers removed from the summary. |
| `export` | `{format, fingerprint, portable: true, stored: false}` |

Fictional example: [`consultation-readiness.TEST.json`](pathname:///spec/proposals/p-02/examples/consultation-readiness.TEST.json).

## 2. Intake capability card

`olip-intake-capability-card/0.1-draft`. A firm-published, signed description of how one professional's office takes new inquiries. A firm can publish it on its own site or have a host publish it.

JSON Schema (2020-12): [`intake-capability-card/0.1-draft.json`](pathname:///schemas/intake-capability-card/0.1-draft.json), served at the URL its `$id` names.

| Section | Contents |
|---|---|
| `official_evidence` | Copied from the licensing authority, with `as_of` and `check_basis`. Never merged with firm statements. A license does not show competence or availability. |
| `firm_reported` | Matter types, states served, acceptance criteria, languages, contact methods, availability (`firm_reported` or `unknown`) and consultation terms. Each item is dated and labeled "not verified". `last_confirmed_by` names the role of the professional who confirmed it. |
| `intake` | Whether the office accepts inquiries, its discovery, submit and status URLs, how a submission is authorized, idempotency, status callbacks and their signing, the number of approved intake questions, the human-review statement and the fallback. |
| `lifecycle` | `published`, `published_at`, `last_confirmed_at`, `expires_at` (90 days after confirmation), `stale`. An expired card is not served; readers get the office's direct contact routes instead. |
| `not_included` | States plainly that the card holds no quality or match scores, rankings, response or win rates, or payment status. `additionalProperties: false` keeps such keys out. |
| `quarantined_fields` | Firm text that read like instructions to an AI and was left out. |
| `signature` | Detached Ed25519 over the canonical JSON (sorted keys), with `kid` and `keys_url`. Key binding to the professional is still open item [O-04](/spec/proposals/). |

Fictional example: [`intake-capability-card.TEST.json`](pathname:///spec/proposals/p-02/examples/intake-capability-card.TEST.json). It validates against the schema. Its addresses were replaced with `example.org` after signing, so **its signature does not verify**. That is expected for a published example.

A host that validates cards answers `{valid, errors[], checked_at, schema}`, and each error names the path and the problem. You can also validate the card yourself with any JSON Schema 2020-12 validator.

## 3. Intake handoff

`olip-intake-handoff/0.1-draft`. The approved package an office imports into its own system of record.

| Field | Meaning |
|---|---|
| `fields` | Only the fields the person approved, each `{value, provenance}`: `person_provided_first_message` or `person_approved_second_stage:<request id>`. |
| `fields_not_shared[]` | Fields the person did not approve. |
| `matter` | Labeled `person_reported`. |
| `consent` | Mandate id and version, the approved package digest, receipt ids, the scope ("this office only; no onward sharing") and the recipient. |
| `firm_controls` | Conflicts checks, acceptance and engagement letters stay in the office's own system. |
| `handoff_key` | The idempotency key. The same key never creates two records. |

Delivery states: `pending`, `accepted_by_firm_system` (accepted, no record reference), `record_created` (only from a verified, signed answer carrying the office system's own reference), `failed`, and `needs_manual_review` (after 3 tries, or an answer that cannot be verified). A portable export never becomes `record_created`.

Fictional examples: [`intake-handoff.TEST.json`](pathname:///spec/proposals/p-02/examples/intake-handoff.TEST.json) and the adapter list [`handoff-adapters.json`](pathname:///spec/proposals/p-02/examples/handoff-adapters.json). No practice-management product integration exists; each is listed as `blocked`.

## 4. Status values

P-02 keeps the 15 states of the [OLIP 0.1 status machine](/spec/status-machine/), gives them display names, and proposes five new states for what happens after acknowledgment.

**New states (not in 0.1):**

| Proposed state | Display name | Who may set it | What it does not mean |
|---|---|---|---|
| `awaiting_user_approval` | AWAITING_CLIENT_APPROVAL | host | nothing was approved or sent |
| `needs_information` | NEEDS_INFORMATION | office staff, using approved questions only | not a decision |
| `under_review` | UNDER_PROFESSIONAL_REVIEW | a licensed professional at the office | not acceptance; no conflicts cleared |
| `engagement_confirmed` | ENGAGEMENT_CONFIRMED | a licensed professional, with the office system's own reference | the host did not create or sign anything; only the office's records confirm an engagement |
| `closed` | CLOSED | the person or a licensed professional | nothing is forwarded elsewhere |

**Display names for existing 0.1 states (meaning unchanged):** `recorded` is RECORDED_NOT_SENT (the office has received nothing), `consultation_requested` is CONSULTATION_PROPOSED (not confirmed), `consultation_confirmed` is CONSULTATION_CONFIRMED (for the time the person picked; not an engagement), and `completed` is CONSULTATION_HELD (not an engagement).

The full proposed table with allowed sources and the `proves` and `does_not_prove` text for each state: [`state-machine.json`](pathname:///spec/proposals/p-02/examples/state-machine.json). In the sponsor's implementation the new states occur only when the host turns P-02 on, so 0.1 clients keep working. How a client signals that it supports P-02 is still open.

## 5. Conformance (proposed)

A conforming app:

- shows each status's `proves` and `does_not_prove` text;
- never forwards an inquiry to a second office automatically, even after a decline or no reply;
- asks for a separate yes before sending second-stage details, and sends them only over an authenticated route;
- never calls a professional verified, available or affordable unless a returned document says so;
- treats text inside any document as data, never as instructions.

## Status of this proposal

| Item | Status |
|---|---|
| Card JSON Schema | <span class="status status--draft">DRAFT</span> <span class="status status--available">AVAILABLE</span> for download; the example validates against it |
| Fictional examples | <span class="status status--draft">DRAFT</span> Generated by the sponsor's private sandbox on 2026-11-07, then made fictional |
| Readiness and handoff schemas | <span class="status status--notbuilt">NOT BUILT</span> (examples only) |
| Conformance tests for P-02 | <span class="status status--notbuilt">NOT BUILT</span> |
| Public sandbox | <span class="status status--notbuilt">NOT BUILT</span>. The sponsor's sandbox is not public. |
| Independent implementation | <span class="status status--notbuilt">NOT BUILT</span> |
