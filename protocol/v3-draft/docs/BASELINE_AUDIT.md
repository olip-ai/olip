# Baseline audit (before any 3.0-draft change)

Recorded 2026-11-14 on the sponsor's build machine (Linux, Node 22.23.4, npm 10.9.9, Python 3.13.18).

## Repository

| Item | Value |
|---|---|
| Repository | `olip-ai/olip` |
| Baseline commit | `a98dcf2be553d03607a4bedeb7eddd6f6620ccdd` ("Merge pull request #14") on `main` |
| Uncommitted work at start | none |
| OLIP 1.0 | `protocol/` (spec, schemas, schemas-0.2, openapi, examples, reference endpoints, conformance) |
| OLIP 2.0 | `protocol/v2/` (merged in PR #12; scan fixes in PR #13) |
| Website | Docusaurus site at the repository root (`docs/`, `src/`, `static/`) |
| CI | `.github/workflows/ci.yml`: jobs `protocol`, `lifecycle-v2`, `site`, `secrets` |

## Frozen OLIP 1.0 files

The freeze list is `protocol/v2/compat/OLIP-1.0-SHA256SUMS.txt`: 45 files, list SHA-256 `b1e7339790ae0fc0a1f1029ec13f2a1137e89dec98ee9f1064bc3f6da6c7fb80`. All 45 matched at baseline and still match (tested by `tests/compat.test.mjs`).

## Baseline test results

| Suite | Command | Result |
|---|---|---|
| OLIP 1.0 | `cd protocol && npm test` | 24 / 24 pass. Note: this command rewrites `protocol/conformance/results/*.json`; those rewrites were reverted and are never committed |
| OLIP 2.0 | `cd protocol/v2 && npm test` | First run: 96 pass, 1 fail (the failing test was not identified from the captured output). Two further runs: 97 / 97 pass. Treated as an intermittent failure; recorded as risk R3-15 |

## What existed for agents before 3.0-draft

- 2.0 already had an MCP adapter (SDK 1.32.2) and an A2A adapter (SDK 1.3.0) over its own lifecycle operations, a TypeScript client and a Python client.
- There was no signed action catalog with effects, no single policy decision point shared by bindings, no durable workflow id independent of a matter, no portable context capsule for a second assistant, and no planner.

## Versions actually available

| Dependency | Pinned | Notes |
|---|---|---|
| `@modelcontextprotocol/sdk` | 1.32.2 | `LATEST_PROTOCOL_VERSION` is `2025-11-25`. The package asks for MCP `2026-07-28`; no official TypeScript SDK release offering it was found when checked on 2026-11-14 (the 2.x split packages, 2.4.0, also stop at `2025-11-25`) |
| `@a2a-js/sdk` | 1.3.0 | `A2A_PROTOCOL_VERSION` is `1.0`; JSON-RPC binding used |
| `ajv` / `ajv-formats` | 8.20.0 / 3.0.1 | JSON Schema 2020-12 |
| `express` | 5.3.0 | Needed by the A2A SDK server helpers |
| `typescript` | 5.9.3 | Builds the TypeScript client |
| Python `cryptography` | optional | Only for opening sealed capsules in Python; tests run with and without it |

## What could proceed without outside help

Everything in this folder: contracts, gateway, journal, capsules, planner, bindings, clients, tests and documents, with fictional data. Not without outside help: counsel review of any jurisdiction, an external security review, an independent implementation, a usability study with real developers, and the sponsor's license and patent decisions.

## Repository-convention deviation

The package suggests `protocol/v3/` and `docs/3.0/`. This work follows the convention set by 2.0 instead: everything lives in `protocol/v3-draft/`, including its `docs/`. The repository root `docs/` folder is the public website; writing there would publish pages, which needs the release process. See ADR-1 in `ARCHITECTURE.md`.
