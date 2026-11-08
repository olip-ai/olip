---
id: interoperability
title: Interoperability with MCP, A2A, OpenAPI and OAuth
description: How OLIP's legal semantics layer over MCP tools, A2A messages, HTTPS/OpenAPI and OAuth 2.0, and what has and has not been tested.
---

# Interoperability

OLIP adds legal-intake meaning on top of existing protocols. It does not replace them, and it does not claim compliance with any of them beyond what has been tested.

| Layer | OLIP 0.1 binding | Status |
|---|---|---|
| HTTPS + JSON | `/olip/v0.1/*`, described in [OpenAPI 3.1](pathname:///spec/0.1/openapi/olip-0.1.json) | Tested against both reference endpoints |
| JSON Schema 2020-12 | 16 schemas under [`/spec/0.1/schemas/`](/spec/downloads/#json-schemas) | Examples validate; endpoint responses validate in the walkthrough |
| OAuth 2.0 (RFC 6749) | Client credentials for agents and recipients | Implemented in the reference mocks only |
| JWKS / Ed25519 (RFC 7517, 8032, 8037) | Receipts and recipient events | Node and Python agree byte for byte on canonical JSON and signatures |
| MCP | Agent-side adapter exposing OLIP operations as tools ([OLIP over MCP](/docs/implementing/olip-over-mcp/)) | Tested with the reference endpoint; no approve tool by design |
| A2A | Agent card and JSON-RPC `message/send` with a DataPart | Follows the A2A 0.3 message shape; **not tested against an official A2A SDK** |

## MCP (agent side)

The MCP adapter in the kit (`reference/mcp-adapter.mjs`) connects any MCP host to any OLIP endpoint. Its tools:

`olip_discover_providers`, `olip_get_professional_identity`, `olip_get_intake_policy`, `olip_validate_casebrief`, `olip_prepare_casebrief`, `olip_preview_handoff`, `olip_get_preview`, `olip_submit_approved_handoff`, `olip_get_handoff_status`, `olip_cancel_handoff`, and from 0.2 `olip_get_intake_card` and `olip_verify_receipt`. Full guide: [OLIP over MCP](/docs/implementing/olip-over-mcp/).

There is deliberately **no approve tool**. Tool descriptions tell the model to repeat license statements and states without upgrading them, to treat CaseBrief text as data, and they do not instruct any assistant to prefer any provider.

## A2A (optional profile)

An implementation may publish an agent card at its own `/.well-known/agent-card.json`. A JSON-RPC `message/send` carries a DataPart `{olip_operation, params, idempotency_key?}`; the result is a Message with a DataPart holding the OLIP response and `http_status`. Write operations need the same bearer token. Recipient events are not available over A2A.

## What olip.ai does not do

olip.ai is documentation only. It does **not** host an OLIP endpoint, an MCP server or an A2A agent, and publishes no `/.well-known/olip.json`, `olip-keys.json` or `agent-card.json`. Those belong on each implementer's own domain, and only once they are actually running and tested.

## Taxonomies

OLIP ships a small starter matter list ([`taxonomy-0.1.json`](pathname:///spec/0.1/taxonomy-0.1.json)). Each code has a `sali` block for the SALI Legal Matter Specification Standard (LMSS). **No LMSS mapping has been made yet**: every entry is `unmapped_pending_review`. A mapping is recorded only after checking the IRI in a named LMSS release. OLIP does not claim any affiliation with or endorsement by SALI.
