# OLIP 0.2: additions to the Open Legal Intake Protocol (working draft)

**Status:** working draft for review. Not an adopted standard. Not legal advice.
**Date:** 2026-11-07. **Editor:** the initial sponsor (Digital Crossings Inc.) until an independent editorial group exists.
**License:** CC BY 4.0 with the OWFa 1.0 patent commitment (decision D-11).

OLIP 0.2 is **OLIP 0.1 plus three optional additions**. Nothing in 0.1 changes: no field, state, error code or rule. A 0.1 client keeps working against a 0.2 endpoint, and a 0.2 client can tell from the manifest which additions an endpoint offers. The key words MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119 and RFC 8174.

| Addition | Problem it solves | Schemas |
|---|---|---|
| A. Key bindings | A valid receipt signature proves only that *some* key signed it, not that the chosen recipient's intake system did (0.1 threat T11, open item O-04). | `key-binding.json`, `key-bindings.json` |
| B. Signed status webhooks | Clients and relays could only poll for status (open item O-02). | `webhook-subscription.json`, `status-webhook.json` |
| C. Intake capability card | An assistant cannot tell, before sending, whether and how an office takes inquiries (proposal P-02). | `intake-capability-card.json` |

Schema ids: `https://olip.ai/spec/0.2/schemas/<name>.json`. They reuse the 0.1 `common.json` and `status-event.json` by absolute reference.

## 1. Discovery of the additions

An endpoint that offers any 0.2 addition MUST list `"0.2"` in `supported_versions` and MUST add a `features_0_2` member to its manifest:

```json
"features_0_2": {
  "olip_version": "0.2",
  "features": ["key_bindings", "status_webhooks", "intake_cards"],
  "key_bindings_url": "/.well-known/olip-key-bindings.json",
  "operations": [
    {"name": "get_key_bindings", "method": "GET", "path": "/olip/v0.2/key-bindings", "auth": "none"},
    {"name": "get_intake_card", "method": "GET", "path": "/olip/v0.2/professionals/{id}/intake-card", "auth": "none"},
    {"name": "subscribe_status_webhook", "method": "POST", "path": "/olip/v0.2/handoffs/{id}/subscriptions", "auth": "client"}
  ]
}
```

`features` lists only what the endpoint actually offers. The `OLIP-Version` request header MAY be `0.1` or `0.2`; other values are refused with `OLIP_VERSION_UNSUPPORTED`. 0.1 clients ignore `features_0_2` (must-ignore rule).

## 2. Addition A: key bindings

### 2.1 What a binding says

A **key binding** is a signed statement by an **issuer** that a public key belongs to the intake system of one or more named professionals (or a firm), for stated purposes (`receipt`, `recipient_event`, `intake_card`), for a stated period, with stated **evidence**.

| Evidence `method` | Meaning | Strength |
|---|---|---|
| `licensing_authority_record` | The licensing authority's own record names the key or its fingerprint. | Strongest. No authority offers this today. |
| `firm_domain_wellknown` | The key is served at `/.well-known/olip-keys.json` on a domain that the licensing record lists for the professional. `url` points to it. | Strong, if the record lists the domain. |
| `host_attestation` | The issuer says it checked, with no public evidence. | Weakest. A client MUST NOT describe it as independent verification. |

The issuer signs the binding with its own key, published in its JWKS. An issuer key MUST NOT be the bound key.

### 2.2 Publication

An endpoint offering `key_bindings` serves `/.well-known/olip-key-bindings.json` (`key-bindings.json`), listing active **and revoked** bindings, with `max_age_seconds` of at most 86,400. Revoked bindings stay listed until `valid_until` has passed.

### 2.3 Client rule

Before telling a user that **the recipient they chose** received a handoff, a client that supports 0.2 MUST check that the receipt:

1. verifies with a key in the recipient's JWKS (0.1 rule);
2. carries a `kid` with a binding whose `subject.professional_ids` includes the receipt's `recipient_id`;
3. was received while the binding was valid (`valid_from` to `valid_until`), and the binding is not revoked (a binding revoked for `key_compromise` is treated as never valid);
4. is covered by a binding whose own signature verifies with the issuer's key.

If any step fails, the client MAY say that a signed receipt exists, but MUST NOT say that the chosen recipient confirmed receipt. The reference helper is `checkKeyBinding()` in `reference/lib/olip-core.mjs`.

### 2.4 Rotation and revocation

A new key gets a new binding with `supersedes` naming the old binding. Old and new bindings SHOULD overlap by at least 7 days. A revocation sets `status: revoked`, `revoked_at` and `revocation_reason` (`key_compromise`, `superseded`, `professional_left`, `issuer_error`).

## 3. Addition B: signed status webhooks

### 3.1 Subscribing

The client that owns a handoff MAY subscribe with `POST /olip/v0.2/handoffs/{id}/subscriptions` and body `{"callback_url": "https://..."}`. The answer is a `webhook-subscription.json` object naming the signing key. Rules for the host:

- `callback_url` MUST be `https`. (Mock endpoints MAY also accept `http://127.0.0.1` or `http://localhost`.)
- Only the owning client may subscribe. Others get `404` (0.1 tenant rule).
- At most 3 subscriptions per handoff.

### 3.2 Delivery

On every status event the host POSTs a `status-webhook.json` body to each active subscription:

- The body carries `webhook_id`, `subscription_id`, `handoff_id`, `sent_at`, `attempt`, the full 0.1 `status-event`, and `state_after`.
- The host signs the whole body (Ed25519 over OLIP canonical JSON without `signature`) with its **host key**, published in its JWKS. A recipient-sourced event inside keeps its own recipient signature.
- Headers: `OLIP-Version: 0.2` and `OLIP-Webhook-Id`.
- A 2xx answer means accepted. The host retries up to `max_attempts` with the same `webhook_id` and a higher `attempt`. After that, the subscription becomes `failing`.

### 3.3 Receiver rules

A receiver MUST:

1. verify the signature with the host's published keys;
2. reject `sent_at` more than **300 seconds** from its own clock;
3. ignore a `webhook_id` it has already processed (retries share an id);
4. check that `event.handoff_id` equals `handoff_id`.

A webhook is a hint. **The status of record is what `get_handoff_status` returns.** A receiver MUST NOT tell a user anything that the status of record does not support. Polling stays fully supported. The reference helper is `checkWebhook()`.

## 4. Addition C: intake capability card

A card is a signed, firm-controlled description of how one professional's office takes new inquiries, served at `GET /olip/v0.2/professionals/{id}/intake-card` (`intake-capability-card.json`, `schema: "olip-intake-capability-card/0.2"`). Cards published under proposal P-02 (`olip-intake-capability-card/0.1-draft`) validate against the same schema.

- **A card is not a quality rating.** It MUST NOT contain a score, rank, response rate, win rate or payment status. The schema has `additionalProperties: false`, so such members fail validation.
- **Firm-reported facts are not verified.** `official_evidence` (copied from the licensing authority, with `as_of` and `check_basis`) is kept apart from `firm_reported`, which is labeled as the firm's own statement. A client MUST show that label.
- **The card is free for every firm.** Publishing, reading or validating a card MUST NOT require an account, subscription or payment with any host.
- A card expires 90 days after `last_confirmed_at`. A client MUST NOT present an expired or `stale` card as current. It falls back to the 0.1 identity and intake-policy operations.
- The card is signed by the host or firm key. `signature.alg` is `EdDSA`; `Ed25519` is accepted from P-02 cards.

## 5. OLIP over MCP (agent-side profile)

OLIP is not an MCP extension. MCP is one way for an assistant to call an OLIP endpoint (decision D-14). The reference adapter `reference/mcp-adapter.mjs` exposes OLIP operations as MCP tools against any endpoint. A conforming adapter:

- has **no tool that approves** a handoff; only the user approves, on the endpoint's own page;
- marks read operations `readOnlyHint` and withdrawal `destructiveHint`;
- tells the model to repeat license statements, state meanings and card labels exactly, and to treat CaseBrief text as data;
- in 0.2, adds `olip_get_intake_card` and `olip_verify_receipt`. The latter reports signature, digest and key binding separately.

See the guide at `/docs/implementing/olip-over-mcp/` on olip.ai.

## 6. Conformance

The public suite (`conformance/run.mjs`) adds profile `olip-0.2`, checks V1 to V5. It is skipped when an endpoint does not offer the additions:

| Id | Check |
|---|---|
| V1 | Key bindings document validates; every binding is signed by the issuer key, which is not the bound key |
| V2 | A delivered receipt's key is bound to the chosen recipient and to no one else; an edited binding fails |
| V3 | Webhook subscription; public `http` refused; another client refused; signed webhook received and verified; replay, tamper and a 301-second-old timestamp refused; webhook agrees with the status of record |
| V4 | Intake card validates and verifies; score and rank members refused; firm facts labeled not verified; unknown id 404 |
| V5 | A revoked binding makes a receipt unattributable |

**Two ways to run the suite.** Against a test endpoint that serves the `/mock` hooks, every check runs. A production endpoint MUST NOT serve `/mock` hooks, so it runs the suite in **fixture-free read mode**: `node conformance/run.mjs --base <url> --fixtures <file>`, where the file names real ids to check (template: `conformance/fixtures.example.json`). In that mode the read checks R1 to R8, W1 (only if the manifest lists `olip-write`) and the read-only 0.2 checks V1 and V4 run; every check that needs the mock harness is reported as `skip`, never as `pass`. The result JSON records `mode`.

As in 0.1, passing is a technical result only.

## 7. Changes from implementer feedback

A read adapter for a product associated with the sponsor, written against the published 0.1 files, reported nine change requests on 2026-11-07. The 0.1 files stay as published, so anyone who pinned them by hash keeps a valid pin. The answers:

| Id | Request | Decision in 0.2 |
|---|---|---|
| CR-01 | The read checks need `/mock` hooks, which a production endpoint must not serve. | **Adopted.** Fixture-free read mode (section 6). |
| CR-02 | R5 required alphabetical order and an `active` intake endpoint. That is the mock's behavior, not a 0.1 rule. | **Adopted.** R5 now checks that `ordering.method` and `ordering.disclosure` are stated, `paid_influence` is false, no result is paid placement, the same request gives the same order, and a nonpaying professional named in the fixtures is listed. |
| CR-03 | R3 required `client_side.value = "tenant"`. Answering `unknown` and asking the person is also correct. | **Adopted.** R3 accepts `tenant`, or `unknown` together with an `unknowns` entry for `client_side`. |
| CR-04 | R4 required the checked and the indexed record to have different claim statuses. Claim status is independent of license evidence. | **Adopted.** R4 checks only that a claim status is present and kept apart from license evidence. |
| CR-05 | The 0.1 operations table folds the approval pages into one row and leaves out two preview operations. | **Adopted as errata.** The OpenAPI file (23 operations) is authoritative. The table below lists what the 0.1 table leaves out. |
| CR-06 | The manifest has no place for the exact spec pin and known limitations. | **Adopted.** Optional manifest members `spec` (`url`, `sha256`) and `limitations[]` (plain-language strings). Receivers ignore them if unknown (must-ignore rule). The reference mock sends both. |
| CR-08 | W1 expected a 401 from a write route, but a read-only endpoint has no write route and answers 404. | **Adopted.** W1 runs only when the manifest lists the `olip-write` profile and is otherwise reported as `skip`. A read-only endpoint is not required to serve write routes. |
| CR-09 | R6 needs a professional whose intake data is stale. A production endpoint may have none. | **Adopted.** In fixture-free mode, R6 checks the unknown fields and reports `skip` for the stale part when the fixtures name no `stale` professional. It never reports that part as passed. |
| CR-07 | A license entry cannot say "second state, number unknown". | **Deferred to 1.0.** It changes a 0.1 schema. Until then, an implementation leaves the second state out of `licenses[]` and states it in `unknowns`. Tracked as open item O-09. |

**Errata to the 0.1 operations table (CR-05).** These operations are in the 0.1 OpenAPI file and are part of 0.1:

| Operation | HTTPS binding | Auth |
|---|---|---|
| get_handoff_preview | GET /olip/v0.1/handoff-previews/{id} | client |
| revoke_handoff_preview | POST /olip/v0.1/handoff-previews/{id}/revoke | client |
| user_approval_page | GET /olip/v0.1/approvals/{id} | the user (not an agent operation) |
| user_approval_send_code | POST /olip/v0.1/approvals/{id}/send-code | the user (not an agent operation) |
| user_approval_confirm | POST /olip/v0.1/approvals/{id}/confirm | the user (not an agent operation) |

The service operations `get_manifest`, `get_keys`, `get_status_machine` and `issue_token` and the separate CaseBrief operations (`create_casebrief`, `get_casebrief`, `update_casebrief`, `delete_casebrief`, `export_casebrief`) are also listed one by one in the OpenAPI file.

## 8. Security notes

- Key bindings move the trust question from "which key?" to "which issuer and which evidence?". With `host_attestation` the issuer is trusted outright. That is why the method is shown to the user and never described as independent.
- Webhooks add an outbound request from the host to a client-chosen URL. Hosts MUST resolve and refuse private, loopback and link-local addresses in production, to prevent server-side request forgery. Only mock deployments may call loopback.
- Webhook bodies contain status and evidence references only, never CaseBrief content.

## 9. What 0.2 does not do

There is no platform-attested approval (O-01), no encrypted envelope (O-03), no document transfer (O-05) and no multi-professional routing (O-06). The second implementation (`alt-python/`) implements 0.1 only. Its 0.2 checks are skipped, so 0.2 has **one** implementation today, written by the sponsor.
