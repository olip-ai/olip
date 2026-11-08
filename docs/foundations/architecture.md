---
id: architecture
title: Architecture
description: How OLIP is layered over HTTPS, OpenAPI, OAuth, MCP and A2A; the direct and relay topologies; the operations and conformance profiles.
---

# Architecture

OLIP defines **legal-intake meaning**. It deliberately reuses existing Internet and agent standards for everything else.

```text
 ┌──────────────────────────────────────────────────────────────┐
 │ OLIP 0.1  evidence · eligibility · CaseBrief · consent ·      │
 │           handoff · status machine · policy gate · errors     │
 ├───────────────────────────────┬──────────────────────────────┤
 │ MCP tools (agent side)        │ A2A message/send (optional)  │
 ├───────────────────────────────┴──────────────────────────────┤
 │ HTTPS + JSON · OpenAPI 3.1 · JSON Schema 2020-12               │
 ├──────────────────────────────────────────────────────────────┤
 │ OAuth 2.0 client credentials · JWKS · Ed25519 · canonical JSON │
 └──────────────────────────────────────────────────────────────┘
```

## Topologies

| Topology | Who hosts the handoff | What counts as `delivered` |
|---|---|---|
| **direct** | The recipient's own intake system (self-hosted, or a vendor the firm chose) is the OLIP host. | Storing the handoff, proven by a receipt the recipient's system signs. |
| **relay** | A host forwards to the recipient over a transport such as email or a webhook. | Only a receipt from the recipient's system. A transport accepting the message is `sent`, never `delivered`. |

No topology requires Digital Crossings' infrastructure, data, brand, account or payment.

## Operations

The HTTPS binding lives under `/olip/v0.1/`. Full table in [spec section 6](/spec/0.1/#6-operations); machine-readable in the [OpenAPI document](pathname:///spec/0.1/openapi/olip-0.1.json).

| Step | Operations | Auth |
|---|---|---|
| Discover | `discover_providers`, `get_professional_identity`, `get_intake_policy` | none |
| Prepare | `prepare_or_validate_casebrief` (validate, create, update, get, delete, export) | client |
| Authorize | `preview_handoff`; the **user** approves at `/olip/v0.1/approvals/{preview_id}` | client; then the user |
| Connect | `submit_approved_handoff` (with `Idempotency-Key`), `get_handoff_status`, `cancel_when_possible` | client |
| Report | `record_recipient_event` | recipient only |

The user-approval step is **not an agent operation**. There is intentionally no API by which a calling agent can approve.

## Conformance profiles

| Profile | For | Summary |
|---|---|---|
| `olip-read` | Directories, firms, legal-aid groups | Identity, intake policy, discovery (may return only itself), errors, version handling. No login. A static JSON file per professional is enough. |
| `olip-write` | Firm intake systems and vendors that receive handoffs | Everything in read, plus CaseBriefs, previews, user approval, submit, status, cancel, recipient events, receipts, idempotency and tenant isolation. |
| `olip-mock-harness` | Test deployments only | Hooks so the public conformance suite can play the user. MUST NOT exist in production. |
| `olip-a2a-binding` | Optional | A2A message binding. |

An implementation declares its profiles in a manifest at `/.well-known/olip.json` on **its own** domain.

:::note No public OLIP endpoints are listed here
olip.ai is a documentation site. It does not host an OLIP endpoint, MCP server or A2A agent. Any `/.well-known/` file described on this site belongs on an implementer's own domain.
:::

## Data conventions

- Every object carries `olip_version` (`"0.1"`); clients send the `OLIP-Version` header.
- IDs are opaque and never reused; cross-system IDs SHOULD be URNs (`urn:olip:<issuer-domain>:<type>:<local>`).
- Times are RFC 3339 with an explicit offset; human dates carry an IANA `time_zone`.
- **Unknown is an answer.** Uncertain values use `{value, status, as_of}` where status is one of `official_source_checked`, `authority_issued_credential`, `indexed_unverified`, `self_reported`, `inferred`, `verified`, `unknown`, `not_provided`, `stale`, `conflicting`.
- Extensions use `domain/name` keys; receivers keep unknown extensions and ignore unknown members. Extensions never change the meaning of a core field or state.

See also: [Actors and trust boundaries](/docs/foundations/actors-and-trust/), [Interoperability](/docs/implementing/interoperability/).
