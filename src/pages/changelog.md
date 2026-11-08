---
title: Changelog
description: Tracked changes to the OLIP specification, schemas, reference kit and this documentation site.
---

# Changelog

All dates are UTC. Versions refer to the specification draft line.

## 2026-11-08: website only (no change to any specification text, schema or rule)

- New [Try OLIP](/try/) page: a browser-only, fictional simulation of one handoff, including the refusal and failure paths. No network requests, no storage, no cookies; automated tests cover every path.
- New [Pick your path](/docs/paths/) guides for AI agent developers, law firms and legal software vendors, a [five-minute read-only example](/docs/paths/read-only-discovery/), a [versions and compatibility guide](/spec/versions/), [conformance results](/conformance/) with pass, fail and skip for every check, and [Contributing](/docs/contributing/report-an-error/) guides.
- Fixed: the quickstart said `cd olip-0.1-draft`, but the kit unpacks to `olip-0.2-draft`. Fixed: the Python endpoint result is 29 pass and 6 skip (A2A plus the five 0.2 checks), not "1 optional skip". Fixed: Community said contributions follow the license "once that license is approved"; the licenses were granted on 2026-11-07.
- The source is public at [github.com/olip-ai/olip](https://github.com/olip-ai/olip), with issue forms, a pull request template, continuous integration and private vulnerability reporting. Community, Status and the contributing guides now point to its issue tracker (email still works). The draft MCP Registry name is now `io.github.olip-ai/olip-sandbox` (not published).
- Version, license, sponsor and adoption facts now come from one checked source, so every page shows the same values.
- Kit and schema zips are now built reproducibly (fixed timestamps, sorted entries). Their SHA-256 values changed once because of this; the files inside are unchanged except the kit's tests and conformance results timestamps. New values are on [Downloads](/spec/downloads/).

## 2026-11-07: spec 0.2 draft (additions), licenses granted

**Specification and schemas**
- [OLIP 0.2](/spec/0.2/) adds three optional features to 0.1 without changing anything in 0.1: key bindings (a signed statement that a signing key belongs to a named recipient, with its evidence), signed status webhooks, and the intake capability card (from proposal P-02). Five new schemas under `/spec/0.2/schemas/`; generated examples under `/spec/0.2/examples/`.
- Implementer feedback: change requests CR-01 to CR-06, CR-08 and CR-09 adopted (fixture-free read mode for production endpoints, W1 skipped when an endpoint is read-only, R6 stale part skipped when no stale professional is named, neutral R3, R4 and R5 checks, operations errata, optional manifest `spec` and `limitations`). CR-07 deferred to 1.0 (open item O-09). Decision D-15.
- Decisions D-11 (licenses granted), D-12 (name cleared, per the sponsor), D-13 (0.2 scope) and D-14 ("OLIP over MCP" profile, not an MCP extension).

**Reference kit** (now `olip-0.2-draft-kit.zip`)
- Node reference endpoint: `/.well-known/olip-key-bindings.json`, intake cards, webhook subscriptions and signed delivery; separate host and recipient keys. Python endpoint unchanged (0.1 only).
- Conformance checks V1 to V5 (optional profile `olip-0.2`). MCP adapter: `olip_get_intake_card` and `olip_verify_receipt`. Tests: 24.

**Website**
- New pages: [OLIP 0.2 additions](/spec/0.2/) and [OLIP over MCP](/docs/implementing/olip-over-mcp/). Licensing, status and governance pages updated. The sponsor is named as Digital Crossings Inc.

## 2026-11-07: proposal P-02 (not part of 0.1)

- Added [P-02](/spec/proposal-p02/): consultation readiness, the intake capability card (draft JSON Schema at `/schemas/intake-capability-card/0.1-draft.json`), the intake handoff package and five proposed states. Fictional examples only. No 0.1 field, state, error code or rule changed.

## 2026-11-07: site 1.0.0-draft, spec 0.1 (publication revision)

**Specification and schemas**
- Schema `$id` base changed from the placeholder `https://spec.olip.invalid/0.1/schemas/` to `https://olip.ai/spec/0.1/schemas/` (decision D-09). No field, state, error code or rule changed. The conformance validator was updated in the same change and both endpoints were retested (Node 30/30; Python 29/29 + 1 optional skip).
- Status line of the spec text updated for publication; the editor is described as the initial sponsor.

**Reference kit**
- Added `reference/walkthrough.mjs` and `npm run walkthrough`: success, no-match, failure (unapproved submit, offline firm, blocked mode) and withdrawal paths, with every response checked against the schemas.
- Added `tests/walkthrough.test.mjs`: the walkthrough must pass on both endpoints (suite now 16 tests).

**Website**
- First version of olip.ai: introduction, quickstart, foundations, six module guides, implementing guides, specification pages, downloads with SHA-256 checksums, in-browser validator and consent-digest calculator, implementations, community, governance, security, privacy, accessibility, licensing and legal pages; local search; light and dark themes; sitemap, robots.txt and llms.txt.

## 2026-11-06: spec 0.1 working draft

- First complete draft: six modules, operations, policy gate, errors, versioning, MCP and A2A bindings, mock harness, security requirements and conformance.
- 16 JSON Schemas, OpenAPI 3.1, status machine (15 states), starter taxonomy, 14 fictional examples.
- Node reference mock endpoint, Python second endpoint, MCP adapter, conformance suite (30 checks).
- Threat model, security checklist, governance and licensing proposals, decision log D-01 to D-08.
