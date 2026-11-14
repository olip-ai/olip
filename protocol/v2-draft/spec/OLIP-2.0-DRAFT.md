# OLIP 2.0-draft: the legal-client lifecycle

**Status:** proposed draft, not adopted. Not approved by any standards body, bar or regulator. Implemented in a reference host with fictional data only; not deployed. The published OLIP 1.0 release (wire versions 0.1 and 0.2) is unchanged and remains the only released OLIP.

**Version string:** `2.0-draft` · **Extension identifier:** `olip.ai/lifecycle-capabilities/2.0-draft` · **Base path:** `/olip/v2` · **Schema namespace:** `https://olip.ai/spec/2.0-draft/schemas/`

The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119 and RFC 8174.

---

## 1. Scope

OLIP 1.0 ends when a consumer's approved handoff reaches a lawyer. OLIP 2.0-draft defines what may happen after that, as five optional profiles:

| Profile | Covers |
|---|---|
| `olip-lifecycle-core/2` | Matters, participants, disclosure grants, user approvals, conflict-aware intake, the event envelope, signatures, the journal, webhooks, errors |
| `olip-consultation/2` | Consultation requests, firm-offered times, firm confirmation, rescheduling, firm-attested attendance |
| `olip-engagement/2` | Versioned engagement offers bound to document digests, user acceptance of one exact version, firm confirmation |
| `olip-communications/2` | Threads, messages, documents, delivery receipts, read states, observers |
| `olip-matter/2` | Inactivity, closure, termination and the portable matter passport |

`olip-lifecycle-core/2` is REQUIRED for any of the others. Every other profile is OPTIONAL and negotiated (section 4).

Out of scope, deliberately:

- Lawyer search, ranking, ordering, scoring, freshness or matching. 2.0-draft adds **none**. Discovery uses an alphabetical recipient registry (section 5).
- Payment processing. Payment is never evidence of engagement (INV-01).
- Legal advice, eligibility or conflict decisions. The firm makes those in its own systems; OLIP carries only the firm's signed outcome.
- End-to-end encryption. The reference host encrypts at rest; it is not end-to-end (section 13).

## 2. Roles

| Role | Who | Can |
|---|---|---|
| `consumer` | The person seeking legal help | Approve every disclosure, accept or decline one exact engagement offer version, withdraw, close their own unrepresented matter, export their passport |
| `agent_client` | An AI assistant or app the consumer delegated to | Prepare requests and read what the delegation allows. It **cannot** approve, accept, confirm or sign anything |
| `lifecycle_host` | The operator that stores the matter and relays events (may be a neutral vendor or the firm itself) | Record host-observed facts (queued, accepted by transport, delivered to endpoint, expired). It cannot sign firm facts |
| `firm` | The law firm, through named staff with staff roles | Sign firm facts: screening outcomes, offered and confirmed times, attendance, engagement offers and confirmation, closure |
| `observer` | A party the consumer or firm adds with status-only access | Read status only; no content |

Firm staff roles include `attorney`, `paralegal`, `intake_staff`, `scheduler` and delegated legal software. The firm publishes, in a signed **authority document**, which staff member holds which role and which event types each role may sign; the host enforces exactly that document. Engagement events (`engagement.offered`, `engagement.firm_confirmed`, `engagement.rejected_by_firm`, `engagement.withdrawn`, `engagement.ended`) and matter closure events SHOULD be granted only to the `attorney` role, and the reference firm policy does so. A delegated legal-software actor in the reference policy may record consultation events only.

## 3. Topologies

A conforming deployment uses one of two topologies. The protocol is identical in both.

- **Direct:** the firm runs its own lifecycle host.
- **Relay:** an independent operator runs the lifecycle host and the firm runs a firm endpoint. The relay stores and forwards, but it cannot sign firm events.

Neither topology needs the sponsor's servers, a paid account or a particular vendor.

## 4. Discovery and negotiation

A host MUST serve `GET /olip/v2/capabilities` and the same document at `GET /.well-known/olip-lifecycle.json`. The document (schema `capabilities.schema.json`) states:

- `olip_version: "2.0-draft"` and `status: "proposed_draft_not_adopted"`
- the profiles supported
- the topology and operator
- the approval method
- the signing algorithms
- `paid_influence: false`
- whether the host is in `mock` or `production` mode

A host that also serves OLIP 1.0 MAY advertise the extension identifier in its 1.0 manifest. It MUST NOT change any 1.0 field or version to do so.

A client MUST negotiate before using any 2.0 operation.

- If the host serves no 2.0 capabilities document, the client MUST disable every lifecycle feature and MUST NOT call 2.0 operations. This is the "1.0-only endpoint" case.
- The reference clients refuse locally, without a network call: `OLIP_NOT_NEGOTIATED` if negotiation has not run yet, and `OLIP_PROFILE_NOT_SUPPORTED` for any profile the host did not advertise (which, on a 1.0-only endpoint, is every profile).

## 5. Recipient registry (neutral discovery)

`GET /olip/v2/recipients` lists organizations that accept lifecycle requests.

- The list MUST be sorted alphabetically by display name, with ties broken by `organization_id`.
- It MUST carry `paid_influence: false`.
- It MUST NOT be ordered, filtered or weighted by payment, ranking, scoring, relevance, freshness or any evidence-based method.
- Recipients are chosen by the consumer. The host refuses any disclosure to a recipient the consumer did not select, with `OLIP_RECIPIENT_NOT_USER_SELECTED`.

**Patent note (normative for this draft):** no 2.0 profile requires, and no conforming implementation needs, any method of evidence-bound lawyer search, ranking or ordering, freshness scoring, or reverse-dependency invalidation. If an implementation adds such features, it does so outside OLIP and they MUST stay optional.

## 6. Authentication and delegation

| Principal | How it authenticates | Token prefix (reference) | Lifetime |
|---|---|---|---|
| Consumer | User session (`POST /olip/v2/user-sessions`) | `ous_` | 1 hour |
| Agent | OAuth 2.0 authorization code from a consumer-created delegation, exchanged at `POST /olip/v2/token` | `oat_` | 15 minutes |
| Firm | Client credentials (`oft_`) | `oft_` | 15 minutes |
| Observer | Client credentials (`oob_`) | `oob_` | 15 minutes |

Delegation details:

- The delegation code lives 10 minutes and works once.
- A delegation may include `content_access`. Without it, an agent sees status and metadata only.
- A delegation is per client. A different AI client needs its own delegation.
- Revoking a delegation (`POST /olip/v2/agent-delegations/{id}/revoke`) stops the agent's tokens immediately with `OLIP_DELEGATION_REVOKED`.

## 7. Disclosure grants and user approval

### 7.1 Rule

Every disclosure of consumer information to an organization needs its own **disclosure grant**, approved by the consumer. This covers:

- a conflict screen
- additional screening information
- the fuller CaseBrief
- a consultation request
- a proposal of a time
- a message
- a document
- an engagement response
- a logistics pre-authorization

Grants never carry across recipients, matters, purposes, stages or passports (INV-08).

### 7.2 Grant digest

The grant is bound by a SHA-256 digest over the canonical JSON (section 11) of exactly these members:

```
{ olip_version, action, subject_id, matter_id,
  recipient: { organization_id, endpoint },
  purpose, stage | null,
  fields: sorted by path [ { path, value } ],
  documents: sorted by document_id [ { document_id, sha256 } ],
  content_digest | null, casebrief_revision | null, related_object_id | null, offer_digest | null,
  notice_version, nonce, expires_at, use, max_uses, logistics_templates | null }
```

Any change to a value, field, document, recipient or revision changes the digest. A submit whose digest or data differs from the approved grant MUST be refused with `OLIP_CONSENT_DIGEST_MISMATCH`, and nothing is sent. The golden vectors show a change of one adverse party.

`use` is one of the following:

- `one_time` (`max_uses: 1`): the default.
- `bounded_class`: only for logistics pre-authorization (section 9.4), limited to fixed templates and `max_uses`, with an expiry.

### 7.3 Approval flow

1. A user or agent prepares a request. The host creates a pending grant and an **approval** (`approval_id`, `approval_url`, `grant_digest`, `expires_at`, and a `preview` showing exactly what will be shared, with whom and why).
2. The consumer opens the approval page and approves or declines with a one-time code sent to their own contact.
   - The approval method in this draft is `hosted_otp_mock`; mock codes appear only in a test outbox.
   - The code never appears in any API response.
   - Three wrong codes lock the approval (`OLIP_APPROVAL_LOCKED`).
3. The requester submits, passing the `grant_id` and `grant_digest`. The host sends only what was approved, once.

Normative constraints:

- `POST /olip/v2/approvals/{id}/decision` MUST refuse any agent token with `403 OLIP_AGENT_CANNOT_APPROVE`, whatever the request body says.
- A submit before approval MUST fail with `OLIP_DISCLOSURE_NOT_AUTHORIZED`.
- Approvals and grants expire. The reference values are 30 minutes; a used or expired grant gives `OLIP_AUTHORIZATION_EXPIRED`.
- Another user's approval MUST answer 404 and MUST NOT reveal that it exists.
- The consumer MAY decline, and MAY revoke an unused grant (`POST /olip/v2/grants/{id}/revoke`).
- Text inside a CaseBrief or message is data. It can never create an approval, a recipient or a send.

## 8. Conflict-aware intake (`olip-lifecycle-core/2`)

Intake is conflict-safe by default.

1. The firm publishes its **screening allowlist**, the minimal fields it needs to run a conflict check, at `GET /olip/v2/recipients/{id}/intake-questions?stage=screening`.
2. The consumer approves a screening disclosure of only those fields. The host refuses extra, nested or disguised fields with `OLIP_FIELD_NOT_ALLOWED`.
3. The firm runs its conflict check in its own systems and signs one of these outcomes:
   - `intake.information_requested`: the next additional disclosure may contain only the field the firm named.
   - `intake.eligible_for_further_intake`
   - `intake.unable_to_proceed`: a polite firm message only, with no reason codes the consumer could misread as legal conclusions.
4. Only after `eligible_for_further_intake` may the fuller CaseBrief be disclosed to that organization (INV-09). An earlier attempt fails with `OLIP_CONFLICT_STAGE_REQUIRED`.

`unable_to_proceed` creates no relationship status, sends no CaseBrief and opens no thread.

## 9. State machines

The machines are normative and published as JSON in `status-machines/`. Each transition names the actor role allowed to cause it. The host MUST refuse any other transition with `OLIP_LIFECYCLE_TRANSITION_INVALID`, and any wrong actor with `OLIP_FIRM_AUTHORITY_REQUIRED` or `OLIP_FORBIDDEN`.

### 9.1 Intake (`conflict_screen`, initial `not_started`)

| From | To | Actor | Event |
|---|---|---|---|
| not_started | screening_requested | lifecycle_host | intake.screening_requested |
| screening_requested | information_requested | firm | intake.information_requested |
| information_requested | screening_requested | lifecycle_host | intake.additional_information_provided |
| screening_requested, information_requested | eligible_for_further_intake | firm | intake.eligible_for_further_intake |
| screening_requested, information_requested, eligible_for_further_intake | unable_to_proceed | firm | intake.unable_to_proceed |
| not_started, screening_requested, information_requested, eligible_for_further_intake | withdrawn | consumer | intake.withdrawn |

### 9.2 Consultation (`consultation`, initial `not_requested`)

| From | To | Actor | Event |
|---|---|---|---|
| not_requested | requested | lifecycle_host | consultation.requested |
| requested, reschedule_requested | options_offered | firm | consultation.options_offered |
| options_offered | proposed | lifecycle_host | consultation.proposed |
| proposed | confirmed | firm | consultation.confirmed |
| confirmed | reschedule_requested | firm, consumer | consultation.reschedule_requested |
| confirmed | completed | firm | consultation.completed |
| confirmed | no_show | firm | consultation.no_show |
| requested, options_offered, proposed, reschedule_requested | declined | firm | consultation.declined |
| requested, options_offered, proposed, confirmed, reschedule_requested | cancelled | firm, consumer | consultation.cancelled |
| options_offered, proposed | expired | lifecycle_host | consultation.expired |

Time rules:

- Every offered slot carries both an IANA time zone and a UTC instant (`start_utc`, ending in `Z`), plus the local wall time.
- The host MUST refuse a slot where these disagree, where the zone is not an IANA zone, or where the local time falls in a DST gap (`OLIP_INVALID_REQUEST` with `details.reason`).
- On a fall-back day, the UTC instant decides between the two identical local times.

Confirmation and attendance:

- `consultation.confirmed` MUST name a confirmation reference and the exact slot the consumer proposed. Otherwise the host refuses it with `OLIP_CONSULTATION_SLOT_MISMATCH` (INV-02).
- An expired slot cannot be proposed (`OLIP_CONSULTATION_SLOT_EXPIRED`).
- After a reschedule request, the firm re-offers with a higher offer version.
- `completed` and `no_show` MUST carry a named attendance source (`OLIP_ATTENDANCE_SOURCE_REQUIRED`). Time passing never marks attendance (INV-10). A consumer cannot claim attendance.

### 9.3 Engagement (`engagement`, initial `not_offered`)

| From | To | Actor | Event |
|---|---|---|---|
| not_offered, offered, user_reviewing, user_accepted, user_declined | offered | firm | engagement.offered |
| offered | user_reviewing | lifecycle_host | engagement.user_reviewing |
| offered, user_reviewing | user_accepted | consumer | engagement.user_accepted |
| offered, user_reviewing | user_declined | consumer | engagement.user_declined |
| user_accepted | firm_confirmed | firm (authorized attorney) | engagement.firm_confirmed |
| user_accepted | rejected_by_firm | firm (authorized attorney) | engagement.rejected_by_firm |
| offered, user_reviewing, user_accepted | withdrawn | firm | engagement.withdrawn |
| offered, user_reviewing | expired | lifecycle_host | engagement.expired |
| firm_confirmed | ended | firm (authorized attorney) | engagement.ended |

The offer:

- An offer has an `offer_id`, an integer `version`, a terms summary, a fee summary, `valid_until`, and documents bound by `sha256`.
- Offer documents MUST be firm-uploaded, cleared by the document checks, and hash-matched (`OLIP_DOCUMENT_NOT_CLEARED`).
- The `offer_digest` is SHA-256 over the canonical offer.

Acceptance and confirmation:

- The consumer accepts or declines one exact `offer_digest`, through an approval. A new offer version voids any earlier prepared acceptance. A stale acceptance fails with `OLIP_ENGAGEMENT_OFFER_CHANGED`, and an expired one with `OLIP_ENGAGEMENT_OFFER_EXPIRED`.
- `engagement.firm_confirmed` MUST name the exact `acceptance_id` and `offer_digest` in its evidence, and MUST be signed by a firm key for a staff member whose role the firm's authority document allows to confirm engagements (`attorney` in the reference policy).
- No payment, transport receipt, agent action or host action can move an engagement to `firm_confirmed` (INV-01).
- `user_declined`, `withdrawn` (firm) and `expired` are distinct outcomes and MUST be shown distinctly.

### 9.4 Message delivery (`message`, initial `draft`)

| From | To | Actor | Event |
|---|---|---|---|
| draft | user_authorized | consumer | message.user_authorized |
| user_authorized | queued | lifecycle_host | message.queued |
| queued | accepted_by_transport | lifecycle_host | message.accepted_by_transport |
| accepted_by_transport | delivered_to_endpoint | lifecycle_host | message.delivered_to_endpoint |
| delivered_to_endpoint | read_by_recipient | firm, consumer | message.read_by_recipient |
| queued, accepted_by_transport | failed | lifecycle_host | message.failed |
| draft, user_authorized, queued | cancelled_before_send | consumer | message.cancelled_before_send |
| draft, user_authorized | expired | lifecycle_host | message.expired |

Rules:

- Each substantive consumer message needs its own approval, bound to its exact content digest.
- `delivered_to_endpoint` requires a **delivery receipt** signed by the recipient endpoint. Transport acceptance is not delivery (INV-10), and no notification or email ever creates a firm reply (INV-04).
- Firm messages are firm-signed. Their `drafting` block says whether AI assisted. They are never shown as attorney-reviewed unless the firm states `reviewed_by`.
- A **logistics pre-authorization** lets the assistant send only fixed scheduling templates, a limited number of times, until it expires or is revoked.
- Observers see status only and lose access when removed.

### 9.5 Matter (`matter`, initial `open`)

| From | To | Actor | Event |
|---|---|---|---|
| open | inactive | firm | matter.inactive |
| inactive | open | firm | matter.reactivated |
| open, inactive | closure_proposed | firm | matter.closure_proposed |
| open, inactive, closure_proposed | closed | firm, consumer | matter.closed |
| open, inactive, closure_proposed | terminated | firm (authorized attorney) | matter.terminated |

- A consumer may close only their own intake journey on a matter with no firm-confirmed engagement. A represented matter is closed or terminated only by the engaged firm, and `closure_proposed` and `terminated` carry the firm's notice text. Closing or terminating ends any firm-confirmed engagement.
- After `closed` or `terminated`, consumer messages to that organization are refused (`OLIP_THREAD_CLOSED`) and so is a new thread. Firm closing communications are allowed (INV-05).
- The consumer may export a **matter passport** (`POST /olip/v2/matters/{id}/exports`, schema `matter-passport.schema.json`). It is signed by the host and holds the matter's own record and journal. Approvals do not carry over: a new firm starts screening from the beginning.

## 10. Lifecycle events

### 10.1 Envelope

Every state change is a **lifecycle event** (schema `lifecycle-event.schema.json`) with these members:

- `olip_version` and `event_id` (a URN)
- `matter_id`, plus `object` (`{type, id}`)
- `event_type`
- `actor`: `{role, actor_id, organization_id, staff_role}`
- `prior_revision`, `occurred_at` and `idempotency_key`
- `correlation_id` and `causation_id`
- `evidence` and `payload`
- `signature`

### 10.2 Signature

Firm and host events carry an Ed25519 detached signature (RFC 8032) over the canonical JSON of the event without its `signature` member. The signature member is `{alg: "EdDSA", kid, value}`, where `value` is the base64url Ed25519 signature.

### 10.3 Acceptance rules

A host MUST accept a firm event only if all of the following hold:

1. The signature verifies against a key in the firm's published key set, and the key is not revoked (`OLIP_EVENT_SIGNATURE_INVALID`, `OLIP_KEY_REVOKED`).
2. The firm's current signed authority document lists the actor, unrevoked and unexpired, with a staff role allowed to sign that event type (`OLIP_FIRM_AUTHORITY_REQUIRED`).
3. The event's organization owns the object. Otherwise the host answers 404 and reveals nothing.
4. `prior_revision` equals the object's current revision (`OLIP_REVISION_CONFLICT`). A request without it gets `OLIP_REVISION_REQUIRED`.
5. `occurred_at` is within 300 seconds of the host clock and not before the object's last event (`OLIP_EVENT_STALE`).
6. The `event_id` is new, or is an exact duplicate of a stored event. An exact duplicate is idempotent and returns the stored result; anything else with that ID is refused (`OLIP_EVENT_REPLAYED`).
7. The transition exists for that actor role (section 9).

A host key, an agent token or a consumer session can never produce a firm event, whatever the request body contains.

### 10.4 Contradictions and compromise

Two validly signed, contradictory events for the same object revision MUST produce a **reconciliation record** (`GET /olip/v2/matters/{id}/reconciliations`, `OLIP_EVENT_CONFLICT`). The host MUST NOT silently choose one (INV-07).

If a firm declares a key compromised, every earlier claim attributed to that key is shown at read time as `downgraded_signing_key_compromised`.

## 11. Canonical JSON and digests

Canonical JSON is exactly OLIP 1.0's (1.0 spec section 9.1), unchanged:

- Object keys are sorted by UTF-16 code units.
- There is no insignificant whitespace.
- Strings are escaped as ECMAScript `JSON.stringify` does.
- Only integers appear in signed or digested content.

Digests are written `sha256:` followed by 64 lowercase hex characters. `vectors/golden-vectors.json` gives worked cases for canonical JSON, digests, signatures, the grant digest, the journal chain, zoned times, webhooks, the offer digest and the message content digest.

## 12. Journal, webhooks, idempotency

### 12.1 Journal

The host keeps a per-matter append-only journal. Each entry hash is computed as:

`entry_hash = sha256(canonical({seq, recorded_at, prev_hash, event}))`

The first `prev_hash` is `sha256:` followed by 64 zeros. Any client can verify the chain through `GET /olip/v2/matters/{id}/events`.

### 12.2 Webhooks

Webhooks are **hints**: `hint_only: true`, carrying minimal fields and no content.

- They are signed with the host attestation key.
- Receivers MUST check the signature, freshness (300 seconds) and replay of `webhook_id`, then read the status of record before showing anything.
- Callback URLs MUST be HTTPS and MUST NOT resolve to private, loopback, link-local or metadata addresses, including after DNS rebinding (`OLIP_CALLBACK_URL_REJECTED`).

### 12.3 Idempotency and pagination

Every mutating request MUST carry `Idempotency-Key` (`OLIP_IDEMPOTENCY_KEY_REQUIRED`).

- A retry with the same key and the same body replays the stored response.
- The same key with a different body is refused (`OLIP_IDEMPOTENCY_CONFLICT`).

Lists use a stable opaque cursor, with at most 50 items per page.

## 13. Security and privacy requirements

- **Tenancy:** cross-tenant reads answer 404 for every object type.
- **Rate limits:** answer 429 `OLIP_RATE_LIMITED`.
- **Logs** keep only route templates, status and error codes. They contain no bodies, tokens, codes, names or message text.
- **At rest:** CaseBriefs and message bodies are encrypted (the reference host uses AES-256-GCM). This is not end-to-end encryption, and hosts MUST NOT describe it as such.
- **Documents:**
  - Only allowlisted types are accepted. Content is sniffed against the declared type, and the malware check is a mock in this draft.
  - The size limit is 1,000,000 bytes in the reference host. Filenames are sanitized and storage is private.
  - Uploads need a short-lived token. Downloads use single-purpose tokens that live 300 seconds, are never logged, and are served as inert attachments.
- **Sensitive data:** the host refuses content that looks like a Social Security number, payment card number, immigration A-number or medical detail at the screening stage, and anything that looks like a password or key at every stage including messages (`OLIP_SENSITIVE_DATA_BLOCKED`). This is pattern-based and is a safeguard, not a guarantee.
- **Policy gate:** a host in production mode MUST refuse every lifecycle write for a jurisdiction whose policy status is not `approved_by_counsel` (`OLIP_POLICY_GATE_CLOSED`). Unknown jurisdictions fail closed. No jurisdiction is approved in this draft.

## 14. Errors

Errors use the body `{ olip_version, error: { code, message, retryable, details? } }` (schema `error.schema.json`). Codes are stable. Clients MUST branch on `code`, never on `message`.

The host registry has 44 codes; `tests/schemas.test.mjs` checks that the registry matches what the reference code can return:

`OLIP_AGENT_CANNOT_APPROVE` · `OLIP_APPROVAL_ALREADY_DECIDED` · `OLIP_APPROVAL_CODE_INVALID` · `OLIP_APPROVAL_LOCKED` · `OLIP_ATTENDANCE_SOURCE_REQUIRED` · `OLIP_AUTHORIZATION_EXPIRED` · `OLIP_CALLBACK_URL_REJECTED` · `OLIP_CONFLICT_STAGE_REQUIRED` · `OLIP_CONSENT_DIGEST_MISMATCH` · `OLIP_CONSULTATION_SLOT_EXPIRED` · `OLIP_CONSULTATION_SLOT_MISMATCH` · `OLIP_DELEGATION_REVOKED` · `OLIP_DISCLOSURE_NOT_AUTHORIZED` · `OLIP_DOCUMENT_NOT_CLEARED` · `OLIP_DOCUMENT_REJECTED` · `OLIP_ENGAGEMENT_OFFER_CHANGED` · `OLIP_ENGAGEMENT_OFFER_EXPIRED` · `OLIP_EVENT_CONFLICT` · `OLIP_EVENT_REPLAYED` · `OLIP_EVENT_SIGNATURE_INVALID` · `OLIP_EVENT_STALE` · `OLIP_FIELD_NOT_ALLOWED` · `OLIP_FIRM_AUTHORITY_REQUIRED` · `OLIP_FORBIDDEN` · `OLIP_IDEMPOTENCY_CONFLICT` · `OLIP_IDEMPOTENCY_KEY_REQUIRED` · `OLIP_INTERNAL` · `OLIP_INVALID_REQUEST` · `OLIP_KEY_REVOKED` · `OLIP_LIFECYCLE_TRANSITION_INVALID` · `OLIP_NOT_FOUND` · `OLIP_PASSPORT_INVALID` · `OLIP_PAYLOAD_TOO_LARGE` · `OLIP_POLICY_GATE_CLOSED` · `OLIP_RATE_LIMITED` · `OLIP_RECIPIENT_NOT_USER_SELECTED` · `OLIP_REVISION_CONFLICT` · `OLIP_REVISION_REQUIRED` · `OLIP_SCHEMA_INVALID` · `OLIP_SENSITIVE_DATA_BLOCKED` · `OLIP_THREAD_CLOSED` · `OLIP_THREAD_MEMBERSHIP_REQUIRED` · `OLIP_TOKEN_EXPIRED` · `OLIP_UNAUTHENTICATED`

There are three further client-side codes: `OLIP_HTTP_ERROR`, `OLIP_NOT_NEGOTIATED` and `OLIP_PROFILE_NOT_SUPPORTED`.

## 15. Cross-machine invariants

| ID | Invariant |
|---|---|
| INV-01 | No `engagement.firm_confirmed` from agent_client, lifecycle_host or consumer roles. |
| INV-02 | No `consultation.confirmed` without a firm-signed event that names a confirmation reference and matches the user's proposed slot. |
| INV-03 | The OLIP 1.0 handoff machine is unchanged; no 2.0 state is ever written into a 1.0 handoff. |
| INV-04 | No user-visible firm reply is created from a transport or email notification; replies are firm-signed messages. |
| INV-05 | No consumer messages to an organization after the matter is closed or terminated, except a new authorized thread; firm closing communications are allowed. |
| INV-06 | Late, duplicate, replayed or out-of-order events never advance a projection illegally; duplicates are idempotent. |
| INV-07 | Two validly signed contradictory events for the same object revision produce a flagged reconciliation record, never a silent choice. |
| INV-08 | Each disclosure needs its own user grant bound to recipient, purpose, exact fields or content digest, revision, notice version, nonce and expiry. Grants never carry across recipients or passports. |
| INV-09 | A full CaseBrief may be disclosed to an organization only after that organization's conflict screen is `eligible_for_further_intake`. |
| INV-10 | Attendance, delivery and reading are never inferred from time passing or transport acceptance. |

## 16. Assistant bindings

### 16.1 MCP

An MCP binding exposes only assistant-safe operations as tools. It MUST NOT expose any tool that approves, decides, grants consent, accepts an offer or confirms anything for a firm. The reference adapter enforces this with name patterns in its tests.

Where the client supports URL-mode elicitation, the binding opens the host's approval page. An elicitation result of "accept" means only that the user opened the page. It is **not** an approval. Approval exists only when the host says so.

### 16.2 A2A

An A2A binding carries operations as data parts under the required extension `https://olip.ai/spec/2.0-draft/a2a-lifecycle-extension`.

- A step that needs the consumer's approval leaves the task in `TASK_STATE_AUTH_REQUIRED`, with the approval page as a URL part.
- A later `submit` on the same task completes only if the consumer really approved.
- Authority errors reject the task; other errors fail it. Either way the task carries the stable OLIP code.

## 17. Compatibility with OLIP 1.0

- No 1.0 file, schema, state, version string or conformance result changes. The freeze list of 45 files and its SHA-256 sums is checked by test.
- 2.0 schemas use their own `$id` namespace. 2.0 states are never written into a 1.0 handoff (INV-03).
- One address may serve both 1.0 and 2.0. A 1.0 client on such a host sees only 1.0.
- A 2.0 client against a 1.0-only endpoint disables lifecycle features.

## 18. Conformance

A conformance claim names the profiles, topology and build it covers, and reports each check as `pass`, `fail`, `skip` or `mock_only`. A mock-only result is never a pass for production. A self-run result MUST NOT be labeled independent.

The black-box runner in `conformance/` implements checks C-01..C-09, B-01..B-10 and S-01.

## 19. Status of this draft

This draft has been implemented, tested and run in mock mode only, and is not deployed. Jurisdiction rules await counsel review, and the code awaits an external security review. Nothing is production approved. See `docs/PROGRESS.md` and `docs/RELEASE_GATES.md`.
