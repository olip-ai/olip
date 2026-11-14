# Compatibility plan

Status: **implemented, tested.**

## Promise

OLIP 1.0 is frozen. 2.0-draft adds without changing anything.

| Promise | How it is checked | Result |
|---|---|---|
| All 45 frozen 1.0 files are byte-for-byte unchanged | SHA-256 of each file against the freeze manifest (manifest SHA-256 `b1e7339790ae0fc0a1f1029ec13f2a1137e89dec98ee9f1064bc3f6da6c7fb80`) | 45 / 45 match |
| No 2.0 file inside a frozen 1.0 folder | Path check | pass |
| 2.0 schema `$id`s use their own namespace | `$id` check | pass |
| The 1.0 handoff state machine is untouched and shares no 2.0-only state (INV-03) | Machine comparison | pass |
| The unchanged 1.0 conformance suite passes against the combined 1.0 + 2.0 host | Runs the 1.0 runner | pass |
| 1.0 clients on the combined host see only 1.0 states | Live check | pass |
| A 2.0 client against a 1.0-only endpoint disables lifecycle features (Node and Python) | Live check | pass |
| The 1.0 test suite still passes | `(cd protocol && npm test)` | 24 / 24 |
| The website test suite still passes | `npm test` | 25 / 25 |

All rows come from `tests/compat.test.mjs` and `tests/vectors-python.test.mjs`, which run in CI.

## How 1.0 and 2.0 coexist at one address

- 1.0 paths and the 1.0 manifest are served unchanged.
- The 1.0 manifest MAY list the extension identifier `olip.ai/lifecycle-capabilities/2.0-draft`. No 1.0 field or version changes.
- 2.0 lives under `/olip/v2` and `/.well-known/olip-lifecycle.json`.
- A 2.0 state is never written into a 1.0 handoff (INV-03).

## Version negotiation

1. The client reads `/olip/v2/capabilities`.
2. If the document is missing, the client sets `lifecycle = false` and refuses every lifecycle call locally with `OLIP_PROFILE_NOT_SUPPORTED`. A call before negotiation is refused with `OLIP_NOT_NEGOTIATED`.
3. If the document is present, the client uses only the advertised profiles (`OLIP_PROFILE_NOT_SUPPORTED` otherwise).

## Changing 2.0-draft itself

2.0-draft is not frozen. Until it is adopted, any change goes through a proposal issue. Generated files must match their generators; tests fail on drift.
