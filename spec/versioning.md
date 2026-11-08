---
id: versioning
title: Versioning and compatibility
description: OLIP version policy - semantic versions, 0.x may break with notice, must-ignore, version negotiation, stable schema URLs and status-machine rules.
---

# Versioning and compatibility

- **Semantic versions** for the spec (MAJOR.MINOR.PATCH). Schemas live under `/spec/<minor line>/schemas/` (for 0.1: `https://olip.ai/spec/0.1/schemas/`). Each schema's `$id` is its URL.
- **0.x may change incompatibly.** Each change is recorded in the [decision log](/governance/#decision-log) and the [changelog](/changelog/) with a migration note.
- **From 1.0:** minor releases only add optional members, new error codes, new extensions, or new states with a documented mapping to existing ones. Removals or meaning changes need a new major version and at least 12 months of overlap.
- **Must-ignore:** receivers ignore unknown members and keep unknown `extensions`.
- **Negotiation:** clients send the `OLIP-Version` header; endpoints list `supported_versions` in their manifest and refuse unsupported majors with `OLIP_VERSION_UNSUPPORTED`.
- **Status machine:** transitions are never relaxed in a minor release. New states must map to an existing state for older clients.
- **Conformance suite** is versioned with the spec; a result always names the suite version.

## Release policy (proposed)

| Step | Requirement |
|---|---|
| Editorial change | Public notice; 7 days for comment |
| Normative change | Public proposal with schema change, conformance test and example; at least 14 days of comment |
| Release | Tagged files under a new versioned path; changelog entry; checksums published |
| Ratification of 1.0 | Not before the open gates on [Status](/spec/status/) are met |

Until an independent editorial group exists, the sponsor applies this policy as editor. The proposed decision rules are on [Governance](/governance/).

## Migration note for 0.1 (2026-11-07)

Schema `$id` values changed from the placeholder `https://spec.olip.invalid/0.1/schemas/` to `https://olip.ai/spec/0.1/schemas/`. No field, state or code changed. Implementations that loaded schemas by `$id` must update the base URL.
