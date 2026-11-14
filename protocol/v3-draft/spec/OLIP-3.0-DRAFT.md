# OLIP 3.0-draft: agent compatibility layer

**Status:** proposed draft, not adopted. Not approved by any standards body, bar or regulator. Not independently security reviewed. Implemented in a reference host with fictional data only; not deployed. The published OLIP 1.0 release (wire versions 0.1 and 0.2) is unchanged and remains the only released OLIP. The OLIP 2.0 lifecycle is unchanged and is reused, not redefined.

**Version string:** `3.0-draft.1` · **Extension identifier:** `olip.ai/agent-compatibility/3.0-draft` · **Profile:** `olip-agent-compat/3` · **Base path:** `/olip/v3` · **Schema namespace:** `https://olip.ai/spec/3.0-draft/schemas/`

The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119 and RFC 8174.

---

## 1. Scope

OLIP 2.0 defines what happens between a consumer and a firm after intake: screening, consultation, engagement, messages and closure. OLIP 3.0-draft adds what an **existing AI application** needs to use those steps safely with little bespoke code:

| Part | What it adds | Section |
|---|---|---|
| Agent manifest and action contracts | One signed, machine-readable catalog of actions, their effects, who may call them and what approval they need | 4, 5 |
| Policy gateway | One decision function that every binding calls, deciding only from server-side state | 6 |
| Approval-bound disclosure | Prepare, user approves on the host's page, send exactly that, once | 7 |
| Durable workflows and the event journal | A stable workflow id, a signed hash-chained journal, cursors, gap detection, optional webhook hints | 8 |
| Legal context capsules | A user-controlled, selective, signed (optionally encrypted) export that a second assistant can import with the user's authorization | 9 |
| Next-actions planner | A deterministic list of procedural next steps with dispositions; never permission | 10 |
| Bindings | HTTPS (normative reference), MCP and A2A, all thin mappings of the same engine | 11 |

Out of scope, deliberately:

- Search, ranking, ordering, scoring, freshness, matching or recommendation of lawyers. 3.0-draft adds **none**. Discovery is the 2.0 alphabetical registry with `paid_influence: false`.
- Legal advice, deadline calculation, eligibility or conflict decisions.
- Any approval, acceptance or confirmation performed by an assistant. There is no such action.
- End-to-end encryption between people. Capsule encryption is to one assistant's key (section 9.5).
- Any requirement to use a sponsor's service, account, product or infrastructure.

## 2. Relationship to OLIP 1.0 and 2.0

1. A 3.0-draft host MUST NOT change the meaning of any OLIP 1.0 or 2.0 field, state or route.
2. A 3.0-draft host MUST run beside a 2.0 lifecycle host on the same resource server, or call one with the caller's own credential. Every lifecycle step MUST be executed by the unchanged 2.0 rules, including their consent, firm-authority and policy checks.
3. Lifecycle states reported through 3.0-draft MUST be the 2.0 status of record, unmodified, with the meanings in section 12.
4. The 3.0-draft layer MAY add checks; it MUST NOT remove or weaken a 2.0 check.

## 3. Principals

| Principal | Who | Can |
|---|---|---|
| `public` | Anyone | Read the manifest, keys, schemas, errors, the organization list and an organization's intake policy |
| `user` | The person seeking legal help, signed in | Everything an agent can, plus export, authorize import of, and revoke context capsules. Approves disclosures only on the 2.0 approval page |
| `agent` | An AI application the user delegated to | Read the user's workflows, prepare requests, send what the user approved, import capsules the user authorized for it. It **cannot** approve, accept, confirm, sign for a firm or change policy |
| `firm` | The organization's own authenticated system | Record firm-signed lifecycle events, which the 2.0 host verifies |
| `operator` | The host operator | Change jurisdiction policy. Never through a model-facing binding |

Tokens come from the co-located 2.0 host. A 3.0-draft host MUST reject an agent token whose delegation the user revoked (`GRANT_REVOKED`).

## 4. Agent manifest

4.1 A host MUST serve the manifest at `GET /.well-known/olip-agent.json` and `GET /olip/v3/agent-manifest`. The manifest MUST validate against `agent-manifest.schema.json`, MUST be signed (Ed25519 detached signature over the canonical JSON of the document without `signature`, as in 2.0) by a key published at `GET /olip/v3/keys`, and MUST NOT contain case data, client identities, staff lists or secrets.

4.2 Required content: `release_status: "proposed_draft_not_adopted"`, `supported_olip_versions`, the full action contract list, the effect meanings, the policy summary (section 6.4), the status semantics table (section 12), `approval.approval_is_model_callable: false`, and `neutrality` with `paid_influence`, `sponsor_services_required` and `sponsor_account_required` all `false`.

4.3 `etag` MUST be the digest of the manifest content excluding `expires_at` and `signature`, so clients revalidate cheaply. `expires_at` bounds caching.

4.4 A client SHOULD verify the signature before relying on the manifest and MUST treat contract fields as documentation: the gateway decides (section 6).

## 5. Action contracts

5.1 Each action has a contract (`action-contract.schema.json`): `id`, `version`, `effects`, `effect` (the strictest of `effects`), `principals`, `approval` (`none`, `user_out_of_band`, `user_session`), `firm_authority`, `mutating`, `idempotency`, `retry`, `transports`, `input_schema`, `output_schema`, `preconditions`.

5.2 Effects, strictest first:

| Effect | Meaning |
|---|---|
| `privileged_admin` | Trust, key or policy administration by the host operator. Never available to a model tool |
| `firm_authoritative` | Only the organization's own authenticated, authorized system may do this |
| `external_disclosure` | Sends client or case information to a recipient. Needs the user's approval bound to that recipient and content |
| `authorized_state_change` | Changes only the caller's own already-authorized workflow, settings or consent records |
| `local_preparation` | Computes a draft, preview or validation. Sends nothing to any third party |
| `read_only` | No external effect. Still access-controlled |

5.3 Actions in this draft (22): `olip.get_capabilities`, `olip.find_professionals`, `olip.get_recipient_policy`, `olip.prepare_casebrief`, `olip.start_workflow`, `olip.get_workflow`, `olip.list_workflow_events`, `olip.preview_disclosure`, `olip.submit_approved_disclosure`, `olip.cancel_pending_request`, `olip.plan_next_actions`, `olip.export_context_capsule`, `olip.validate_context_capsule`, `olip.authorize_capsule_import`, `olip.import_context_capsule`, `olip.get_imported_capsule`, `olip.revoke_context_capsule`, `olip.subscribe_events`, `olip.cancel_subscription`, `olip.call_lifecycle`, `olip.record_firm_event`, `olip.set_jurisdiction_policy`.

5.4 No action id, MCP tool name, A2A skill id or lifecycle operation offered to an agent MAY name an approval, decision, acceptance or confirmation. Actions whose effect is `firm_authoritative` or `privileged_admin`, and actions whose only principal is `user`, MUST NOT be offered through MCP or A2A.

5.5 Inputs MUST validate against the action's input schema. Unknown properties MUST be refused (`SCHEMA_INVALID`), never interpreted.

5.6 `olip.call_lifecycle` reaches an allowlist of consumer-side 2.0 operations (`get_conflict_screen`, `get_consultation`, `get_engagement`, `get_thread`, `get_messages`, `get_matter_events`, `request_consultation`, `propose_consultation_slot`, `respond_to_engagement_offer`, `create_thread`, `send_message`, `submit_consultation_request`, `submit_consultation_proposal`, `send_authorized_message`). The object MUST belong to the workflow's matter; otherwise `NOT_FOUND`. Operations that send anything are `external_disclosure` and pass section 7.

## 6. Policy gateway

6.1 Every binding MUST call one policy decision function before any handler runs, and again immediately before any external disclosure. It decides only from: the authenticated principal, the action's strictest effect, the jurisdiction policy, the matter's fictional flag, and (for disclosures) the user's recorded approval. Tool descriptions, request flags, model output and text inside case content MUST NOT change the outcome.

6.2 Decisions: `allow`, `require_user_approval`, `require_firm_authority`, `deny`, `unknown_policy`. Every refusal carries a stable error code (section 13), the decision, the missing preconditions and the policy version.

6.3 Fail closed. For writes (`authorized_state_change`, `external_disclosure`, `firm_authoritative`):

- an unknown jurisdiction, or a matter without one, MUST be refused (`POLICY_UNREVIEWED`, decision `unknown_policy`);
- a `suspended` jurisdiction MUST be refused (`POLICY_UNREVIEWED`, `deny`);
- a jurisdiction whose `review_by` date has passed MUST be refused (`POLICY_STALE`);
- in production mode, any jurisdiction whose status is not `approved_by_counsel` MUST be refused (`POLICY_UNREVIEWED`);
- in mock mode, a matter not marked fictional MUST be refused.

6.4 The policy summary in the manifest names the policy set, its version, each jurisdiction's status and review dates, and states that unknown jurisdictions fail closed. Every journal entry and receipt records the policy version in force.

6.5 Only the `operator` principal may change policy, and only through the HTTPS binding.

## 7. Approval-bound disclosure

7.1 `olip.preview_disclosure` prepares exactly what would go to ONE organization the user picked, through the 2.0 host, and returns the 2.0 approval (`approval_id`, `approval_url`, `grant_id`, `grant_digest`, `expires_at`). It MUST NOT send anything (`sent: false`).

7.2 Only the user approves, on the 2.0 approval page, with a one-time code sent to their own contact. A 3.0-draft host MUST NOT offer any way for an agent to approve. An agent calling the 2.0 decision route MUST get 403.

7.3 `olip.submit_approved_disclosure` MUST, immediately before the side effect: check that the request is not cancelled or already sent; check that the grant belongs to this request, this user, this matter and this recipient; check that it is active, unexpired, unused and that `grant_digest` matches; run the policy gateway again. The 2.0 host then checks again atomically. Any change to the content after approval (for example a CaseBrief edit) voids the approval.

7.4 Mutating actions MUST carry an `Idempotency-Key` (8 to 128 characters). The key is scoped to the principal, the client and the action. The same key with the same input returns the stored result with `idempotent_replay: true`; with different input, `IDEMPOTENCY_CONFLICT`. Errors are not stored, so a refused call can be retried after the user approves. A sent disclosure cannot be sent again with a new key (`CONFLICTING_STATE`).

7.5 `olip.cancel_pending_request` cancels a prepared, unsent disclosure. It MUST NOT claim to undo a delivered disclosure.

7.6 A successful call means the host ran the action. Clients MUST report `delivery.state` exactly as returned; `delivered_to_endpoint` means the firm's endpoint returned a signed receipt for that content, not that anyone read it.

## 8. Durable workflows and the event journal

8.1 `olip.start_workflow` creates the user's 2.0 matter and a durable `workflow_id`. Workflows are visible only to principals of the owning user; everyone else gets `NOT_FOUND`.

8.2 The journal is a list of event envelopes (`workflow-event.schema.json`), each with `sequence` (from 1, no gaps), `previous_event_digest` (the previous entry's `event_digest`, or 64 zeros), `event_digest` (digest of the envelope without `event_digest` and `signature`), an Ed25519 signature by the host's `workflow_events` key, `actor_type`, `source`, `policy_version`, `payload_digest` and a minimal payload. Entries MUST carry references, never CaseBrief content.

8.3 2.0 lifecycle entries are mirrored as `lifecycle.<event_type>` with `v2_ref` (2.0 sequence, entry hash, event id, signer key id). Firm-signed entries are attributed `firm_signed_verified_by_2_0_host`; the 3.0 layer never re-signs firm facts as its own.

8.4 `olip.list_workflow_events` returns entries after an opaque cursor, a `next_cursor`, `has_more` and a whole-chain check. Cursors are HMAC-signed by the host and bound to one workflow; a forged or foreign cursor is `SCHEMA_INVALID`. A cursor ahead of the journal, or a `last_seen_digest` that does not match the entry at the cursor, is `EVENT_CURSOR_GAP`. Clients MUST verify each page's chain and signatures from their last verified digest.

8.5 Webhooks are optional hints. A subscription's callback URL MUST pass outbound-request checks (https only, no credentials, no fragment, no loopback, private, link-local or metadata addresses, DNS results checked) at subscribe time AND at every delivery attempt. Redirects MUST NOT be followed. A hint carries only ids, the event sequence, type and digest, `sent_at` and a signature; never content. Delivery retries with exponential backoff and jitter, then dead-letters. Receivers MUST verify the signature, reject `sent_at` outside their skew window and deduplicate on `webhook_id`. Polling is always the source of truth.

8.6 A host that restarts from its store MUST keep workflow ids, journals, cursors and idempotency records, so a client resumes from its saved cursor and a retried send replays instead of sending twice.

## 9. Legal context capsules

9.1 A capsule (`context-capsule.schema.json`) is a user-controlled, selective, signed export of task context. It is not a transcript, not assistant memory, not a privilege guarantee, and not authorization to contact anyone.

9.2 Only the signed-in user may export (`olip.export_context_capsule`). The user picks `include_fields`; every other CaseBrief field is listed in `excluded_fields` with a reason and its value is absent. Capsules MUST exclude model reasoning, raw chat transcripts, session identifiers, credentials and document contents. A field that looks like a credential MUST be refused (`SENSITIVE_DATA_BLOCKED`).

9.3 Every claim is an assertion with `origin_type` (`user_reported`, `document_extracted`, `official_source_checked`, `firm_asserted`, `third_party_asserted`, `ai_interpretation`), `source_ref`, `observed_at`, `verified_at`, `verification_status`, `content_digest` and `untrusted_text_flags`. `firm_asserted` claims MUST be derived by the host from signature-verified 2.0 events; a caller cannot label its own claim. An assistant's interpretation is a separate `ai_interpretation` claim; a disagreement with another claim is recorded in `conflicts` as `unresolved`. Dates are `time_sensitive_fields` with `calculation: null`: user-reported, never a computed deadline. Documents are references with `content_included: false`.

9.4 The capsule carries `source_provenance` and `workflow_snapshot` naming the exact journal position it reflects, `export_authorization` with `onward_disclosure: false` and `authorizes_recipients: []`, `retention` with an honest legal-hold caveat, `capsule_digest` and the issuer's signature.

9.5 Optional encryption: to one assistant's X25519 public key with ECDH-ES, HKDF-SHA256 (salt `epk.x + "." + recipient.x`, info `olip-3.0-draft capsule`) and AES-256-GCM, with additional data `capsule_id|olip_version`. The capsule then carries `sealed_content` instead of `content`, and `encryption.content_digest`. The issuing host sees the plaintext when it builds the capsule; this is not end-to-end encryption between people.

9.6 Import needs an import authorization the user creates for ONE assistant (`client_id`) and ONE capsule digest, with `max_uses: 1`. Import MUST fail if the authorization is missing (`USER_APPROVAL_REQUIRED`), names another assistant (`RECIPIENT_MISMATCH`), was used (`REPLAY_DETECTED`), expired or was revoked, if the capsule does not match it (`DIGEST_MISMATCH`), or if the capsule fails its checks (`CAPSULE_INVALID`). Import MUST create no approval (`grants_created: 0`) and MUST NOT let the importing assistant send anything without a new user approval.

9.7 The user may revoke a capsule; imports and reads on the issuing host stop. The host MUST say that copies already taken elsewhere cannot be recalled.

## 10. Next-actions planner

10.1 `olip.plan_next_actions` is a pure, deterministic function of server-side state: identical state MUST produce byte-identical output and the same `plan_digest`. It uses no clock and no model.

10.2 Each step names an action (and, for lifecycle steps, an operation and target), a disposition (`allowed_read_only`, `allowed`, `requires_user_approval`, `requires_firm_authority`, `blocked`), a reason code and missing preconditions. Plans carry `not_authorization: true` and `not_legal_advice: true`.

10.3 "allowed" is a hint. The gateway checks again when the step is called; a plan never grants anything. A goal (`desired_goal`) may reorder steps but MUST NOT change any disposition.

## 11. Bindings

11.1 **HTTPS** (normative reference): REST routes in `openapi/olip-v3-draft.json` and a generic `POST /olip/v3/actions/{action_id}/invoke`. `OLIP-Version: 3.0-draft.1` is optional; any other value is `VERSION_UNSUPPORTED`. `X-Correlation-Id` is echoed. Paths outside `/olip/v3` on the same origin are served by the 2.0 host unchanged.

11.2 **MCP**: one tool per action offered to agents, named with dots replaced by underscores, with the action's input schema, annotations (`readOnlyHint` only for read-only non-mutating actions; `openWorldHint` for disclosures) and the action id and effect in `_meta`. Errors are tool results with `isError: true` and the OLIP error body. URL-mode elicitation, where the client supports it, is used ONLY to open the user's approval page; its answer is never an approval. The adapter derives the Idempotency-Key from the session, the tool and the exact arguments. Protocol version: as negotiated by the pinned official SDK (section 14).

11.3 **A2A 1.0**: one skill per action offered to agents; a message with a data part `{ "olip_action": "<id>", "arguments": { ... } }` runs one action. Results needing the user's approval go to `TASK_STATE_AUTH_REQUIRED` with the approval page as a URL part; `{ "olip_action": "submit" }` on the same task completes only if the gateway finds the user's real approval. Errors map to task states from the error catalog. Task completion is not a legal outcome. The OLIP `workflow_id` travels in metadata and is never treated as an A2A task id.

11.4 The same input MUST give the same decision and error code through every binding.

## 12. Status semantics

| State | Means | Does not mean |
|---|---|---|
| tool call succeeded | The host ran the action | Any organization received, read or accepted anything |
| A2A task completed | The agent-level task ended | A consultation was held or representation began |
| `accepted_by_transport` | A relay accepted the item | The firm's system confirmed receiving it |
| `delivered_to_endpoint` | The firm's endpoint returned a signed receipt for this exact content | Anyone read it, responded, or took the matter |
| `eligible_for_further_intake` | The firm says intake may continue | A conflict clearance finding or representation |
| `consultation_confirmed` | The firm confirmed an appointment time | The consultation happened or legal advice was given |
| `engagement_offer_issued` | The firm signed a versioned offer | The client accepted or representation began |
| `client_accepted_offer` | The user's acceptance of one exact offer version was recorded | The firm confirmed the engagement |
| `firm_confirmed` | The firm's authorized attorney signed a confirmation ("Firm reports engagement confirmed") | A legal determination that an attorney-client relationship exists |
| `matter_closed` | The firm (or, unrepresented, the user) closed the matter | All obligations, records or legal holds have ended |
| capsule imported | One assistant may read one user-authorized capsule | Permission to contact or send anything to any organization |
| planner "allowed" | Current state suggests the step is available | Permission |

Clients MUST repeat these meanings and MUST NOT infer more.

## 13. Errors

Stable codes with HTTP status, retryability and A2A task state are listed in `docs/ERROR_CATALOG.md` (generated from the reference table) and served at `GET /olip/v3/errors`. Hidden objects MUST answer `NOT_FOUND`. 2.0 errors are mapped to 3.0 codes, keeping the original in `details.lifecycle_v2_code`.

## 14. Versioning and compatibility

- Wire version `3.0-draft.1`. A later draft changes the suffix. Nothing here is called `3.0`.
- Schemas use draft 2020-12 under the 3.0-draft namespace and refuse unknown properties on inputs.
- MCP: the reference adapter uses the official TypeScript SDK pinned at 1.32.2, whose newest protocol revision is `2025-11-25`. MCP `2026-07-28` is not offered by that SDK; support for it is a documented gap (see `docs/COMPATIBILITY_MATRIX.md`).
- A2A: the reference adapter uses the official JavaScript SDK pinned at 1.3.0 (protocol 1.0, JSON-RPC binding).

## 15. Security considerations

Covered in `docs/ARCHITECTURE.md` (trust boundaries) and `docs/RISK_REGISTER.md`. In short: assistants are untrusted callers; case text is data, never instructions; approvals happen only on the host's page; firm facts are verified by the 2.0 host; audit records hold no content or tokens; outbound requests are SSRF-checked twice; production writes stay closed until counsel approves a jurisdiction and an external security review is recorded.

## 16. Intellectual property and neutrality

This draft adds no search, ranking, ordering, freshness or recommendation method and requires none. No part of it requires a method of the sponsor's Patent Family A; this is a design statement, not a legal opinion, and is awaiting the sponsor's patent confirmation. The license grant for 3.0-draft is a sponsor decision that has not been made (the OWFa covers OLIP 1.0 only). No sponsor service, account or product is required to implement, run or test anything here.
