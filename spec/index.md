---
id: index
title: Specification
slug: /
description: The OLIP specification - current draft version 0.2 (0.1 plus three additions), status, normative files, downloads and versioning.
---

# OLIP specification

| | |
|---|---|
| **Current version** | 0.2 (working draft, 2026-11-07): [OLIP 0.1](/spec/0.1/) plus [three additions](/spec/0.2/) |
| **Status** | <span class="status status--draft">DRAFT</span> proposed for review; not ratified or adopted |
| **Canonical text** | [OLIP 0.1 full text](/spec/0.1/) and [OLIP 0.2 additions](/spec/0.2/) |
| **Normative machine-readable files** | [JSON Schemas, OpenAPI 3.1, status machine, taxonomy](/spec/downloads/) |
| **License** | CC BY 4.0 with the OWFa 1.0 patent commitment ([Licensing](/license/)) |
| **Editor** | The initial sponsor (Digital Crossings Inc.) until an independent editorial group exists |
| **Released versions** | None. There is no 1.0 and no ratified version. |

## Read

1. [Status](/spec/status/): exactly what is drafted, tested and not built.
2. [Full text of OLIP 0.1](/spec/0.1/): normative requirements (MUST, SHOULD, MAY per RFC 2119 and RFC 8174).
3. [OLIP 0.2 additions](/spec/0.2/): key bindings, signed status webhooks, intake capability card.
4. [Security considerations](/spec/security-considerations/) and the [threat model](/spec/threat-model/).
5. [Status machine](/spec/status-machine/): every state and allowed transition.
6. [Versioning and compatibility](/spec/versioning/).
7. [Proposals and open questions](/spec/proposals/): what is being considered for later versions.

## Download

- [`olip-0.1-schemas.zip`](pathname:///downloads/olip-0.1-schemas.zip): 0.1 schemas, examples, OpenAPI, status machine, taxonomy.
- [`olip-0.2-schemas.zip`](pathname:///downloads/olip-0.2-schemas.zip): the 0.2 schemas and examples.
- [`olip-0.2-draft-kit.zip`](pathname:///downloads/olip-0.2-draft-kit.zip): all of the above plus the reference mock endpoints, MCP adapter, conformance suite and tests.

All files and checksums: [Downloads](/spec/downloads/).

## Provenance

OLIP 0.1 was drafted on 2026-11-06 from the sponsor's earlier work on agent-to-lawyer intake (its open protocol workstream, "V7"), then revised on 2026-11-07 for publication (schema identifiers moved to `https://olip.ai/spec/0.1/schemas/`; a quickstart walkthrough added). Every change is in the [changelog](/changelog/).
