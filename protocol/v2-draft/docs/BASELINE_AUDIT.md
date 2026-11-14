# Baseline audit (before OLIP 2.0-draft work)

Base commit: `a71837b` on `main` ("Merge pull request #11 from olip-ai/fix/windows-and-site-ci"). Audit date: 2026-11-14.

## What existed

| Area | Location | State at baseline |
|---|---|---|
| OLIP 1.0 normative text | `protocol/spec/` | Published, frozen. Wire versions 0.1 and 0.2 |
| 1.0 schemas | `protocol/schemas/`, `protocol/schemas-0.2/` | 24 schema files |
| 1.0 examples | `protocol/examples/`, `protocol/examples-0.2/` | Fictional |
| 1.0 reference mock server, client, demo, walkthrough | `protocol/reference/` | Implemented, tested, mock only |
| 1.0 MCP adapter | `protocol/reference/mcp-adapter.mjs` | Hand-written JSON-RPC, not the official SDK |
| 1.0 conformance suite | `protocol/conformance/` | Runs against the reference server |
| 1.0 independent Python check | `protocol/alt-python/` | Standard library, including a pure-Python Ed25519 |
| Website (Docusaurus) | root `docs/`, `src/`, `docusaurus.config.js` | Publishes olip.ai |
| CI | `.github/workflows/ci.yml` | Protocol tests, site tests, site build, publication scan |

## The 1.0 freeze

The freeze manifest `OLIP-1.0-SHA256SUMS.txt` (dated 2026-11-11, from `protocol/` at `e80d02aa`) lists 45 normative files with their SHA-256 sums. The manifest file itself has the SHA-256 `b1e7339790ae0fc0a1f1029ec13f2a1137e89dec98ee9f1064bc3f6da6c7fb80`. A copy is committed at `protocol/v2-draft/compat/OLIP-1.0-SHA256SUMS.txt`, and `tests/compat.test.mjs` checks the copy against that digest.

At baseline, all 45 files matched the manifest. After this work, all 45 still match (tested).

## Baseline test results

| Suite | Command | Result at baseline |
|---|---|---|
| 1.0 protocol | `(cd protocol && npm test)` | 24 / 24 pass |
| Website | `npm test` | 25 / 25 pass |
| Publication scan | `npm run scan` | 0 findings |

## Gaps at baseline relevant to 2.0

1. Nothing existed after the handoff: no consultation, engagement, messaging or closure model.
2. There was no conflict-aware staging of disclosure. A 1.0 handoff carries the brief in one step.
3. There was no firm-signed event model with staff authority, key rotation or contradiction handling.
4. The 1.0 MCP adapter was not built on the official MCP SDK, and there was no A2A binding.
5. There were no golden vectors for signatures over lifecycle objects.
6. The 1.0 license grant (OWFa 1.0) covers 1.0 only. Nothing covers a 2.0 draft (see RISK_REGISTER R-09).

## Decisions taken because of the audit

- 2.0 lives in its own package, `protocol/v2-draft/`. No file in a frozen 1.0 folder is touched (tested).
- 2.0 docs live in `protocol/v2-draft/docs/`, not in the root `docs/`, so the public website never shows draft material (see ARCHITECTURE, ADR-003).
- 2.0 reuses the 1.0 canonical JSON implementation by import, so the two cannot drift.
