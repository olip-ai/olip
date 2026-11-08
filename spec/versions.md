---
id: versions
title: Versions and compatibility guide
description: Which OLIP version to build against - 0.1 base versus the optional 0.2 additions - what each contains, where its files live, and how they work together.
---

# Versions and compatibility guide

| | OLIP 0.1 (base) | OLIP 0.2 additions |
|---|---|---|
| Status | Draft, 2026-11-06 | Draft, 2026-11-07 |
| What it is | The protocol: evidence, eligibility, CaseBrief, consent, handoff, status | Three **optional** features on top of 0.1 |
| Contains | [Text](/spec/0.1/), 16 schemas, OpenAPI 3.1, status machine, taxonomy, 14 fictional examples | [Text](/spec/0.2/), 5 schemas, 5 generated examples: key bindings, signed status webhooks, intake capability card |
| Schema URLs | `https://olip.ai/spec/0.1/schemas/…` | `https://olip.ai/spec/0.2/schemas/…` |
| Conformance | 30 checks (profiles `olip-read`, `olip-write`, `olip-mock-harness`, `olip-a2a-binding`) | 5 checks (profile `olip-0.2`, optional) |
| Changes to 0.1 | none | none: 0.1 files are unchanged, so their hashes stay valid |

**Build against 0.1.** Add 0.2 features only if you need them. An endpoint that implements 0.1 only is fully conformant to 0.1; the 0.2 checks report as skipped, not failed. A 0.2 client talking to a 0.1-only endpoint falls back to 0.1 behavior.

**Negotiation.** Clients send the `OLIP-Version` header; endpoints list `supported_versions` in `/.well-known/olip.json` and refuse unsupported versions with `OLIP_VERSION_UNSUPPORTED`.

**Downloads.** `olip-0.1-schemas.zip` (0.1 only), `olip-0.2-schemas.zip` (0.2 additions only) and `olip-0.2-draft-kit.zip` (everything, plus the reference endpoints, MCP adapter and conformance suite; it unpacks to the folder `olip-0.2-draft`). Checksums: [Downloads](/spec/downloads/).

The full policy: [Versioning](/spec/versioning/). Historical 0.1 pages and URLs stay available.
