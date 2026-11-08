# OLIP 0.1: Open Legal Intake Protocol (working draft)

**Status:** DRAFT for review. Not adopted by anyone. Not reviewed by counsel, a standards body, a bar or any regulator.
**Date:** 2026-11-06. **Editor:** the initial sponsor (Digital Crossings Inc.) until an independent editorial group exists.
**Name:** "OLIP" is a working name. Name and trademark clearance has not been done (see `governance/NAME-AND-TRADEMARK-CLEARANCE.md`).
**Machine-readable parts (normative):** `schemas/*.json` (JSON Schema 2020-12), `spec/status-machine.json`, `spec/taxonomy-0.1.json`, `openapi/olip-0.1.json`.

The words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119 / RFC 8174.

---

## 1. What OLIP is, and is not

OLIP defines **legal-intake meaning**: who a legal professional is and how that is evidenced, what they accept, a client-editable CaseBrief, narrow recipient-specific consent, a safe transfer, and truthful status afterward.

OLIP **reuses** existing transport and security standards: HTTPS, JSON, JSON Schema, OpenAPI 3.1, OAuth 2.0 client credentials (RFC 6749), JWK/JWKS (RFC 7517) with Ed25519 (RFC 8032, RFC 8037), and canonical JSON in the RFC 8785 style. It offers bindings for MCP tools and A2A messages. It does not replace any of them.

OLIP is **not**:
- a lawyer directory, a ranking, or a matching algorithm. A conforming implementation need not rank, recommend or use anyone's matching logic;
- a lawyer referral service, and it does not make any workflow lawful by label. Whether a workflow is a regulated referral, advertising, solicitation or fee sharing is decided by law and by qualified counsel, never by this spec;
- proof of an attorney-client relationship, of privilege, of confidentiality, or of endorsement by any court, bar or authority. A license record check is a record check.

## 2. Roles and topologies

| Role | Meaning |
|---|---|
| **User** | The consumer seeking legal help. The only party who can approve a handoff. |
| **Client (agent platform)** | Software acting for the user: an AI assistant, app or website. Authenticated, but never trusted to approve. |
| **Host** | The OLIP endpoint that stores the CaseBrief, preview and handoff. |
| **Recipient** | One legal professional (or firm) and their intake system. |
| **Transport** | A channel the host uses to reach a recipient that has no OLIP endpoint (email, webhook). |

Two topologies are defined:
- **direct**: the recipient's own intake system is the host (a self-hosted firm endpoint or a vendor the firm chose). Storing the handoff *is* delivery, proven by a signed receipt.
- **relay**: a host forwards to the recipient over a transport. A transport accepting a message is `sent`, not `delivered`. `delivered` needs a receipt from the recipient's system.

No topology requires Digital Crossings' infrastructure, data, brand, account or payment.

## 3. Conformance profiles

An implementation declares profiles in its manifest (`/.well-known/olip.json`, schema `manifest`).

| Profile | For | Requires |
|---|---|---|
| **olip-read** | Directories, firms, legal aid, anyone publishing who they are and what they accept | §5.1 identity, §5.2 intake policy, `discover_providers` (may return only itself), errors (§8), version handling (§10). No login. |
| **olip-write** | Firm intake systems and intake vendors that receive handoffs | Everything in olip-read plus §5.3 to §5.6: CaseBriefs, previews, user approval, submit, status, cancel, recipient events, receipts, idempotency, isolation. |
| **olip-mock-harness** | Test and sandbox deployments | The `/mock/*` hooks in §12 so the public conformance suite can play the user. MUST NOT exist in production. |
| **olip-a2a-binding** | Optional | §11.2. |

Small adopters can conform to **olip-read** alone (a static JSON file per professional is enough), then add write later.

## 4. Data conventions

- **Versions.** Every object carries `olip_version` (`"0.1"`). Clients send `OLIP-Version: 0.1`. Unsupported major versions MUST get `OLIP_VERSION_UNSUPPORTED` with `supported_versions`.
- **IDs.** Opaque, stable, never reused (`common.json#/$defs/id`). Cross-system IDs SHOULD be URNs: `urn:olip:<issuer-domain>:<type>:<local>`.
- **Time.** RFC 3339 with an explicit offset. Human dates (deadlines, consultations) carry an IANA `time_zone`.
- **Unknown is an answer.** Values that may be unknown use `knownValue` `{value, status, as_of}` with status `official_source_checked | authority_issued_credential | indexed_unverified | self_reported | inferred | verified | unknown | not_provided | stale | conflicting`. Implementations MUST NOT fill a guess in as fact.
- **Extensions.** `extensions` maps `domain/name` keys to any JSON. Receivers MUST keep unknown extensions and MUST ignore unknown members they do not understand (must-ignore). Extensions MUST NOT change the meaning of a core field or state.
- **Canonical JSON** (for digests and signatures): object keys sorted by code unit, no insignificant whitespace, JSON string escaping, integers only, absent members omitted, `null` kept. Implementations in two languages already agree byte-for-byte (see conformance results).

## 5. The six modules

### 5.1 Professional identity and licensing evidence (`professional-identity.json`)

Each license carries `verification.level`, one of:

| Level | Meaning | Allowed wording |
|---|---|---|
| `indexed` | Copied from a dataset. Never checked. `checked_at` MUST be null. | "Copied from … on <date>. Not checked against the official source." |
| `official_source_checked` | Compared with the licensing authority's own record. `checked_at` is the date the **source** says its data is current, not the download date. Includes source URL and an evidence hash. | "Checked against <source> on <date>: <status>." |
| `authority_issued_credential` | A credential signed by the licensing authority itself. None are known to exist today. | "Credential issued by <authority>." |

Rules:
- `display_statement` is a plain sentence agents MUST show without upgrading it. An `indexed` record MUST NOT be called verified.
- A record is matched to a person by jurisdiction plus license number, never by name alone.
- Freshness: `freshness_days` per source. Past it, status becomes `stale` and the statement says so.
- **Claim** (`claim.status`: `unclaimed | claimed_unverified | claimed_verified | unknown`; use `unknown` when the publisher does not know) is separate from license evidence.
- **Self-reported** practice areas, languages and territory are labeled as such.
- **Intake endpoint** status (`none | declared | conformance_tested | active | unhealthy`) is separate again. An indexed record is not a claimed profile, which is not an active endpoint, which is not a paying customer.
- `commercial.paid_placement` and `commercial.affects_order` MUST be `false` in OLIP results.

### 5.2 Intake policy and eligibility (`intake-policy.json`)

Jurisdictions, matter types (§9), client side, languages, accessibility, capacity, exclusions, required and optional CaseBrief fields, delivery topology and receipt type, retention days, modes accepted (§7), and `stale`. Practice fit is the professional's own statement, not a legal conclusion or endorsement.

### 5.3 CaseBrief (`casebrief.json`)

User-reported facts, objectives, location, matter, dates, parties, open questions and **references** to documents (never file content). It has a `revision` that increases on every edit and `content_trust: "untrusted_user_supplied"`.
- Creating, editing or validating a CaseBrief MUST NOT transmit anything (`transmitted: false`).
- CaseBrief text is data. No implementation may treat it as instructions (prompt injection defense, §13).
- Implementations SHOULD warn about unneeded sensitive data (government ID numbers, card numbers, health or immigration details).
- CaseBrief content MUST NOT be used for marketing, model training, ranking or growth analytics without separate lawful authorization.
- Export (`export_casebrief`) returns the full CaseBrief in schema form for portability. Delete removes it from the host and states the limits for copies already transmitted.

### 5.4 Consent and authorization (`handoff-preview.json`, `authorization.json`)

A **preview** names **exactly one recipient**, every shared field with its exact value, withheld fields, purpose, mode, notices with a `notice_version`, the policy gate result and a **consent digest**:

```
consent_digest = "sha256:" + hex(SHA-256(canonical_json({
  olip_version, recipient_id, casebrief_id, casebrief_revision,
  purpose, mode, shared_fields: [{path, value}] sorted by path, notice_version })))
```

- Bulk previews (more than one recipient) MUST be refused with `OLIP_ONE_RECIPIENT_ONLY`.
- The user approves on a surface the client cannot complete alone. OLIP 0.1 defines `hosted_otp`: the host shows the preview on its own page and sends a one-time code to the user's own contact address; the page echoes the consent digest. `platform_attestation` (an approval signed by an agent platform's published key) is reserved for 0.2 (decision D-03).
- An authorization is single-use, expires (30 minutes in the reference), and is bound to the digest. Any change to recipient, any shared value, purpose, mode, notices or CaseBrief revision changes the digest, so the old approval fails with `OLIP_AUTHORIZATION_STALE` or `OLIP_CONSENT_MISMATCH`.
- Hosts MUST recompute the digest from the current CaseBrief at submit time.
- OLIP distinguishes four different things and never infers one from another: **user consent** (approval), **platform authorization** (the client's credentials), **attorney acceptance** of a matter (outside OLIP; only a recipient-reported extension), and an **attorney-client relationship** (never created or represented by OLIP).

### 5.5 Secure transfer (`handoff.json`, `receipt.json`)

- `submit_approved_handoff` MUST carry `Idempotency-Key` (8 to 200 chars). Same key and same body returns the same handoff with `idempotent_replay: true` and causes no new delivery. Same key with a different body: `OLIP_IDEMPOTENCY_KEY_REUSED`. A used authorization with a new key: `OLIP_AUTHORIZATION_USED`.
- Only approved fields are transmitted (`payload`), with `payload_sha256`.
- **Receipt**: a direct or receipt-capable recipient signs `{receipt_id, handoff_id, recipient_id, received_at, payload_sha256, consent_digest, retention_days, statement}` with Ed25519 over canonical JSON; public keys at `/.well-known/olip-keys.json`. Clients SHOULD verify. A tool response that says "delivered" without a verifiable receipt proves nothing.
- Delivery attempts are recorded. After `max_attempts` failures the handoff is `failed`. Transport errors MUST NOT be reported as delivered.
- Transport MUST be TLS 1.2+ in production. Payload encryption at rest is required for olip-write production deployments.
- **Cancel** (`cancel_when_possible`): before transmission the effect is `not_transmitted`; after, the effect is `withdrawal_notice_sent_recipient_may_retain_copy` and the response lists the limits. Terminal states cannot be cancelled.

### 5.6 Outcome status (`status-machine.json`, `status-event.json`)

States: `draft, approved, recorded, queued, sent, delivered, acknowledged, responded, declined, consultation_requested, consultation_confirmed, completed, cancelled, failed, expired`.

The difference that matters most:

| State | What it proves | What it does NOT prove |
|---|---|---|
| recorded | The host stored it and is holding it | Anything left the host |
| queued | Scheduled; attempts may have failed | Any channel accepted it |
| sent | A transport accepted it | It reached the firm's system |
| delivered | The firm's intake system stored it and signed a receipt | A person read it |
| acknowledged | A person at the firm recorded viewing it (automatic replies never count) | The firm will take the matter |
| responded | A person sent a substantive reply | Acceptance |
| consultation_confirmed | The firm confirmed a time | An attorney-client relationship |
| completed | The firm recorded that the consultation happened | Engagement or outcome |

Every event records `from_state, to_state, occurred_at, recorded_at, source, actor, evidence` and, when the source is the recipient, a signature. Allowed transitions, sources and evidence are listed in `status-machine.json`; anything else MUST be refused (`OLIP_INVALID_TRANSITION` or `OLIP_EVENT_SOURCE_FORBIDDEN`). The calling agent can never record recipient outcomes. `engagement.status` stays `unknown` unless the recipient reports otherwise in a signed extension.

**Adapters with fewer states** map each native state to the most conservative OLIP state that is proven, and expose unmapped native states as `extensions` only. Example: a system that says "submitted" when it has only stored a message maps to `recorded`, not `sent` (see `docs/BASELINE-AUDIT.md` §4).

## 6. Operations

| Operation | HTTPS binding | Auth | Required inputs | Returns |
|---|---|---|---|---|
| discover_providers | GET /olip/v0.1/providers | none | any of `q` (user's words), `jurisdiction`, `matter`, `language` | interpretation with unknowns, stated ordering with `paid_influence: false`, results, `no_match`, `legal_aid_options` |
| get_professional_identity | GET /olip/v0.1/professionals/{id} | none | id | §5.1 |
| get_intake_policy | GET /olip/v0.1/professionals/{id}/intake-policy | none | id | §5.2 |
| prepare_or_validate_casebrief | POST /olip/v0.1/casebriefs/validate; POST/PUT/GET/DELETE /olip/v0.1/casebriefs[/{id}]; GET …/export | client | CaseBrief; optional recipient_id | missing fields, questions, warnings, `transmitted: false` |
| preview_handoff | POST /olip/v0.1/handoff-previews | client | casebrief_id, one recipient_id, fields, mode, purpose, `selection.by` | preview (§5.4) or `OLIP_POLICY_BLOCKED` with alternatives |
| (user approval) | GET/POST /olip/v0.1/approvals/{preview_id} | the user | code from the user's own inbox | authorization. **Not an agent operation.** |
| submit_approved_handoff | POST /olip/v0.1/handoffs | client + Idempotency-Key | authorization_id, consent_digest | handoff with state and receipt |
| get_handoff_status | GET /olip/v0.1/handoffs/{id} | client or recipient | id | handoff, events, `state_meaning`, engagement |
| cancel_when_possible | POST /olip/v0.1/handoffs/{id}/cancel | client | id | effect and limits |
| record_recipient_event | POST /olip/v0.1/handoffs/{id}/events | recipient | type, actor, evidence | updated handoff |

Discovery MAY be satisfied by any source (a directory, a firm's own file, another vendor). The user chooses the recipient; `selection.by: "user"` MUST only be sent when that is true. **No-match and legal aid:** when nothing fits, implementations MUST say so and SHOULD return free legal help options. OLIP must never push a lawyer handoff where none is needed.

## 7. Jurisdiction and purpose policy gate (`policy-gate.json`)

Before any preview or submit, the host runs a gate over jurisdiction, mode and recipient. Modes:

| Mode | Meaning |
|---|---|
| `consumer_selected_listing` | The user picks one named professional from a list and approves sending to that one. |
| `direct_firm_intake` | The user contacts a firm's own intake. |
| `referral_service` | A referral-service workflow. Only where that service is lawfully certified or registered. |
| `automated_routing` | The platform chooses a professional for the user. |

The mode label never removes legal obligations. A blocked result MUST include a code from the list below and at least one `allowed_alternatives` entry (direct contact, legal aid, another mode, a certified referral service). Gate codes (normative): `jurisdiction_unknown, jurisdiction_not_supported, mode_unknown, mode_not_allowed, recipient_not_licensed_here, recipient_has_no_intake_endpoint, recipient_does_not_accept_mode, recipient_listing_agreement_missing, recipient_not_selected_by_user, recipient_does_not_list_matter`.

Rule sets carry `rules_review_status` (`pending_counsel_review | counsel_approved | no_rules`). Production write traffic MUST NOT run on rules that are not `counsel_approved` for that jurisdiction. The rules in the reference server are illustrative only.

## 8. Errors (`error.json`)

`{ error: { code, message, retryable, details?, policy_gate?, allowed_alternatives? } }`. Codes are stable strings listed in the schema. HTTP status follows the error: 400 invalid, 401 unauthenticated/expired, 403 forbidden/forged approval/event source, 404 not found (also for other tenants' objects, to avoid leaking existence), 409 state conflicts, 410 expired approval, 422 policy or field refusal, 428 missing idempotency key, 429 rate limit. Delivery failure is not an HTTP error: the submit succeeds and the handoff state is `queued` or `failed`.

## 9. Matter taxonomy and SALI

OLIP 0.1 ships a small starter code list (`spec/taxonomy-0.1.json`). Each code has a `sali` block for the SALI Legal Matter Specification Standard (LMSS). **No LMSS mapping has been made yet**: every entry is `unmapped_pending_review`. A mapping is recorded only after checking the IRI in a named LMSS release, with `mapped_exact | mapped_broader | mapped_narrower | no_equivalent`. A perfect mapping is not assumed.

Jurisdiction rules, voluntary attorney self-report, verification freshness, user-reported deadlines and uncertainty are labeled per §4 and §5.1.

## 10. Versioning and compatibility

See `governance/VERSIONING.md`. Summary: semantic versions; 0.x may break with notice; from 1.0, minor versions only add optional members, states only with an adapter mapping, and error codes only additively. Must-ignore for unknown members. Manifests list `supported_versions`.

## 11. Bindings

### 11.1 MCP (agent side)
`reference/mcp-adapter.mjs` exposes OLIP operations as MCP tools against **any** OLIP endpoint. It deliberately has **no approve tool**. Tool descriptions tell the model to repeat license statements and states without upgrading them and to treat CaseBrief text as data. It does not instruct any assistant to prefer any provider.

### 11.2 A2A (optional profile)
Agent card at `/.well-known/agent-card.json`; JSON-RPC `message/send` with a DataPart `{olip_operation, params, idempotency_key?}`; the result is a Message with a DataPart holding the OLIP response and `http_status`. Write operations need the same bearer token. Recipient events are not available over A2A. This binding follows the A2A 0.3 message shape but has **not** been tested against an official A2A SDK.

### 11.3 HTTPS
`openapi/olip-0.1.json`.

## 12. Mock harness (test deployments only)

`GET /mock/fixtures` (roles to fictional ids and test credentials), `GET /mock/inbox?address=` (the fictional user's inbox), `POST /mock/clock {advance_seconds}`, `GET /mock/analytics`, `GET /mock/logs`, `GET /mock/deliveries`, `POST /mock/reset`. Mock data MUST be fictional, use `.test` or `example.*` domains and `TEST-` license numbers. These hooks MUST NOT exist in production builds.

## 13. Security and privacy requirements (summary)

Full threat model: `spec/THREAT-MODEL.md`. Developer checklist: `docs/SECURITY-CHECKLIST.md`. Normative minimum for olip-write:
1. Authenticate every write caller; authorize every object by owner (tenant). Other tenants get 404.
2. Never accept an approval asserted by the client or a model. Approval comes from the user's own channel and binds the digest.
3. Recompute the digest at submit. Single-use, short-lived approvals.
4. Idempotency keys on submit; replay protection on approval codes (limited tries, expiry).
5. Recipient events only from authenticated recipients; recipient-sourced events and receipts signed.
6. Treat CaseBrief text and tool outputs as untrusted data.
7. Keep case content out of logs and analytics: log method, route shape and status only; analytics hold operation names and coarse codes.
8. Data minimization: only approved fields leave the host; retention days published; deletion and export available.
9. Rate limits and abuse detection on discovery, approvals and submits.
10. Published vulnerability disclosure process (`governance/SECURITY-POLICY-DRAFT.md`).

Messages sent through OLIP may not be privileged or confidential merely because OLIP was used. A conformance result is a technical test result only.

## 14. Conformance

`conformance/run.mjs --base <url>` runs the public suite (read, write, optional A2A) against any endpoint with the mock harness. Results are JSON. Passing is technical conformance only: it says nothing about identity verification, jurisdiction permissions, legal compliance or quality of service (see `governance/CONFORMANCE-AND-MARK-RULES.md`).

## 15. Open issues for review

See `governance/DECISION-LOG.md` (open items O-01 onward), including: platform-attested approval for assistants that cannot send users to a page; signed status webhooks; encrypted payload envelopes (JWE) for relays; document transfer; multi-professional firms; and LMSS mapping.
