# OLIP: Open Legal Intake Protocol, working draft 0.1

**OLIP 0.2 additions** (key bindings, signed status webhooks, intake capability card): `spec/OLIP-0.2-DRAFT.md`, `schemas-0.2/`, `examples-0.2/`. Implemented in the Node reference endpoint only. Licenses granted 2026-11-07: spec CC BY 4.0 + OWFa 1.0, code Apache 2.0, examples CC0 1.0.

**DRAFT for review. Not adopted, not reviewed by counsel or any standards body. Fictional data only.** Documentation: https://olip.ai/

OLIP is a proposed neutral format that lets any AI agent help a user send their own CaseBrief to one licensed legal professional they chose, with an approval only the user can give, and with status that never overstates what happened. Digital Crossings Inc. sponsors the draft; conforming to it needs nothing from Digital Crossings Inc.

| Folder | What |
|---|---|
| `spec/` | Spec text, status machine, starter taxonomy, threat model |
| `schemas/` | 16 JSON Schemas (2020-12) |
| `openapi/` | HTTPS binding (OpenAPI 3.1) |
| `examples/` | 14 fictional examples, each validated against its schema |
| `reference/` | Node mock endpoint (no runtime dependencies), client, demo, MCP adapter, A2A binding |
| `alt-python/` | Separate Python endpoint and agent (standard library only, own Ed25519) |
| `conformance/` | Public conformance suite and saved results |
| `governance/` | Charter, licensing/IP, versioning, conformance and mark rules, name clearance, decision log |
| `docs/` | Quickstart and security checklist (status: https://olip.ai/spec/status/) |

Start with `docs/QUICKSTART.md` or https://olip.ai/docs/quickstart/. Status of every item: https://olip.ai/spec/status/.
