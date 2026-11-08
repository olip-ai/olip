---
id: conformance-checklist
title: Conformance checklist
description: The 30 checks of the OLIP 0.1 public conformance suite plus 5 for 0.2, the fixture-free mode for production endpoints, what a passing result means, and how to state it truthfully.
---

# Conformance checklist

The public conformance suite (`conformance/run.mjs` in the [kit](pathname:///downloads/olip-0.2-draft-kit.zip)) runs in two modes. Results are JSON and reproducible, and record which mode ran.

**Test endpoint.** The endpoint exposes the test-only mock harness (`/mock` hooks). Every check runs.

```bash
npm run conformance -- --base https://your-test-endpoint.example --json results.json
```

**Fixture-free read mode, for a production endpoint.** A production endpoint must not serve `/mock` hooks. Copy `conformance/fixtures.example.json`, put in real ids from your endpoint, and pass it with `--fixtures`. The read checks, V1 and V4 run, and W1 runs if the manifest lists the `olip-write` profile. The `stale` id is optional; without it, R6 reports its stale part as skipped. Checks that need the mock harness are reported as skipped, never as passed.

```bash
npm run conformance -- --base https://your-endpoint.example --fixtures my-fixtures.json --json results.json
```

| Check | Profile | What it tests |
|---|---|---|
| R1 | `olip-read` | Manifest is valid and names the version and profiles |
| R2 | `olip-read` | Public discovery works with no login and no payment |
| R3 | `olip-read` | Plain-English tenant query: practice and place interpreted, unknowns exposed; the side may be inferred or left unknown and asked |
| R4 | `olip-read` | Verified license record and merely indexed record make visibly different claims; claim status present and kept apart |
| R5 | `olip-read` | Ordering method and disclosure are stated, never paid, and stable for the same request; a nonpaying lawyer is listed |
| R6 | `olip-read` | Intake policy marks unknown and stale fields |
| R7 | `olip-read` | No-match request returns legal aid options, not an empty dead end |
| R8 | `olip-read` | Unsupported major version is refused with a stable code |
| W1 | `olip-write` | Write operations need an authenticated caller |
| W2 | `olip-write` | A CaseBrief can be created, edited and validated without any transmission |
| W3 | `olip-write` | Preview names exactly one recipient and every shared value |
| W4 | `olip-write` | Submitting without the user's matching approval fails |
| W5 | `olip-write` | Editing the summary invalidates the old approval |
| W6 | `olip-write` | Changing the recipient needs a new approval |
| W7 | `olip-write` | Replay or duplicate submit causes no extra delivery |
| W8 | `olip-write` | Simulated delivery failure is FAILED, never DELIVERED or CONFIRMED |
| W9 | `olip-write` | Email relay is SENT, not DELIVERED, without a recipient receipt |
| W10 | `olip-write` | Signed receipt verifies; acknowledgment is not acceptance |
| W11 | `olip-write` | Status spoofing by the calling agent is refused; transitions are strict |
| W12 | `olip-write` | A prohibited jurisdiction workflow is blocked with an allowed alternative |
| W13 | `olip-write` | Cancel before sending stops it; cancel after delivery states the limits |
| W14 | `olip-write` | Expired approval and expired token are refused |
| W15 | `olip-write` | Cross-tenant isolation: another agent sees nothing |
| W16 | `olip-write` | Case text never appears in analytics, logs or other tenants' data |
| W17 | `olip-write` | Prompt-injection text in a CaseBrief is stored as data and changes nothing |
| W18 | `olip-write` | Only approved fields reach the recipient (data minimization) |
| W19 | `olip-write` | Extensions survive and unknown fields do not break the server (forward compatibility) |
| W20 | `olip-write` | Client discards the first response and retries: still one handoff (network failure reconciliation) |
| W21 | `olip-write` | Status machine published and every recorded event is a legal transition |
| X1 | `olip-a2a-binding` | A2A agent card and message/send reach the same operations |

## What a pass means, and does not mean

"Passes OLIP 0.1 olip-write conformance suite vX on <date>" means the endpoint passed those automated technical tests on that date with fictional data. It does **not** mean the lawyer is verified, licensed in a given state, approved by any bar or regulator, compliant with referral or advertising rules, confidential, privileged, or recommended.

- **There is no certification and no "OLIP Certified" mark.** Only the published suite decides, and anyone may run it for free.
- **State it plainly:** for example "Supports OLIP 0.1 (read, write). Self-tested 2026-11-06." Never "OLIP certified lawyer", "approved", "verified by OLIP", or a badge next to a lawyer's name.
- **Keep three claims separate:** technical conformance, identity evidence level, and jurisdiction permissions.
- **Expiry:** a self-test result is current for 90 days or until a new suite version, whichever comes first.

These rules are drafts; see [Governance: conformance and mark rules](/governance/#conformance-and-mark-rules).

## Recorded results

| Endpoint | Result | Date | Note |
|---|---|---|---|
| Node reference mock (test endpoint) | 35 pass, 0 fail | 2026-11-07 | 0.1 and 0.2 checks; sponsor's machine, fictional data |
| Node reference mock (fixture-free read mode) | 12 pass, 23 skip | 2026-11-07 | shows what a production endpoint can run |
| Python second endpoint | 29 pass, 6 skip (X1 A2A; V1 to V5, 0.2 not offered) | 2026-11-07 | same author as the Node endpoint |

No third-party endpoint has been tested.
