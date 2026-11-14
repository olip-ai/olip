# Final acceptance report (package format A to H)

Proposed draft, not adopted, not independently security reviewed, not deployed. Fictional data only.

## A. What was inspected

- `olip-ai/olip` at `a98dcf2be553d03607a4bedeb7eddd6f6620ccdd` on `main`, no uncommitted work. Work is on a branch for one pull request.
- Freeze list `protocol/v2/compat/OLIP-1.0-SHA256SUMS.txt` (45 files, list SHA-256 `b1e7339790ae0fc0a1f1029ec13f2a1137e89dec98ee9f1064bc3f6da6c7fb80`): all match.
- 2.0 status: a merged, working reference (5 lifecycle profiles, 97 tests, mock only, not deployed). 3.0-draft builds on it rather than on stubs.
- Assumptions: the folder convention of 2.0 applies (ADR-1); the official MCP and A2A SDKs available today are the targets (ADR-10).

## B. Working artifacts

- Code: `protocol/v3-draft/` (reference layer, HTTPS binding, MCP and A2A adapters, TypeScript and Python clients, conformance runner, sandbox, 14 test files) and one new CI job in `.github/workflows/ci.yml`. No other file in the repository changed.
- Routes: `/.well-known/olip-agent.json`, `/olip/v3/{agent-manifest, actions, actions/{id}, actions/{id}/invoke, keys, errors, openapi.json, schemas/*, professionals, recipients/{id}/policy, casebriefs/check, workflows, workflows/{id}, workflows/{id}/events, workflows/{id}/cancel, disclosures/preview, disclosures/submit, actions/plan-next, capsules/*, subscriptions, lifecycle, firm-events, admin/jurisdiction-policy}`; `/olip/v2/*` unchanged.
- Demo: `npm run demo` runs 12 steps with two assistants from discovery to closure.
- Sandbox: `npm start` prints a local address and a fictional assistant token.

## C. Compatibility

- OLIP 1.0: 45 / 45 frozen files unchanged; 1.0 suite 24 / 24.
- OLIP 2.0: no file changed; suite 97 / 97; same-origin pass-through tested.
- MCP: official TypeScript SDK 1.32.2, protocol `2025-11-25`. MCP `2026-07-28`: **not supported** (no official SDK release found on 2026-11-14).
- A2A: official JavaScript SDK 1.3.0, protocol 1.0, JSON-RPC.

## D. Permissions and security

Invariants, each tested: no assistant can approve, accept, confirm or act for a firm, in any binding; every disclosure needs the user's approval bound to one recipient and exact content and is rechecked at send; unknown, suspended, stale and (in production) unreviewed jurisdictions refuse writes; cross-tenant access answers `NOT_FOUND`; firm facts only from firm-signed events verified by the 2.0 host; capsules authorize nothing and import creates zero approvals; callback URLs checked twice, no redirects; journal tamper detected at the exact entry; no duplicate sends under retries and 4 concurrent calls; audit holds no content or tokens.

Unresolved: no external security review; mock operator secret and test keys derived from public labels; single-process store; unauthenticated loopback A2A server; several package adversarial cases not applicable or not tested (listed in `TEST_REPORT.md`).

## E. Cross-agent proof

Tested on one Linux machine: official MCP SDK client (in-memory transport), official A2A SDK client (JSON-RPC over loopback HTTP), the TypeScript client over HTTP, and a separately written Python client over HTTP. The same decisions and codes come back through all four HTTPS/MCP/A2A paths. Not tested: ChatGPT, Claude, Gemini or any other product as an MCP or A2A host; any independent implementation of the host.

## F. Performance and usability

Measured: 22 actions, 17 MCP tools, 15 A2A skills; manifest 26,821 bytes; MCP tool list 15,916 bytes; 1,011-event property test; 70 tests in about 26 s. **Not measured**: the 30-minute developer integration target, latency under load, cold-cache install time.

## G. Release readiness

Available: a tested, mock-only draft in the repository. Gated: everything else (`RELEASE_GATES.md`). Production writes are **disabled**: production mode refuses every regulated write because no jurisdiction is approved by counsel (tested). No counsel review, no security review, no license or patent decision for 3.0. Nothing was published to olip.ai.

## H. Next actions

1. Merge the pull request (sponsor). Safe without outside approval: it adds files only under `protocol/v3-draft/` plus a CI job.
2. Sponsor decisions: license grant for 3.0-draft; patent confirmation (no Patent Family A methods required).
3. Add MCP `2026-07-28` when an official SDK release offers it (maintainers; dependency: SDK release).
4. Invite one independent implementer to run `conformance/run.mjs` against their own host (governance).
5. Run the 30-minute quickstart study with outside developers (sponsor).
6. Production components: real approval channel, durable store, key custody, authenticated A2A (implementers), then an external security review and counsel review for one jurisdiction before any production write.
7. Investigate the one intermittent 2.0 test failure seen at baseline (maintainers).
8. Optional: a page on olip.ai describing 3.0-draft as a proposed extension, through the release process.
