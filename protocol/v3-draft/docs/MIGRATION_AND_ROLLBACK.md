# Migration and rollback

## For a 2.0 host operator adding 3.0-draft

1. Keep the 2.0 host unchanged. Start the 3.0 layer in the same process with `createAgentLayer({ v2: host, clock, mode, storePath, hostLabel })` and serve it with `createHttpBinding`, or use `startV3System`.
2. Keep `mode: "production"` unless you are testing with fictional data. In production every regulated write is refused until a jurisdiction is `approved_by_counsel` with a future `review_by` date.
3. Publish the keys at `/olip/v3/keys`. The signing keys in this reference are derived from public labels and must be replaced with keys from your own key custody before any real use.
4. Existing 2.0 clients keep working: every `/olip/v2/*` path is served by the 2.0 host as before.

## For an AI application

1. Read `/.well-known/olip-agent.json`, verify its signature, and use `supported_olip_versions`.
2. Use the 3.0 actions where available; fall back to the 2.0 routes otherwise. Nothing in 2.0 changes.
3. Store each workflow's `cursor` and last verified digest, and resume with them.

## Rollback

- Stop serving `/olip/v3/*` and `/.well-known/olip-agent.json`. The 2.0 host is unaffected; its data never moved.
- The 3.0 store holds only references (workflow ids, journal entries, idempotency records, capsule records, subscriptions, audit). Deleting it removes 3.0 history but no case content.
- Capsules already exported stay with whoever holds them. Revocation stops imports and reads only on the issuing host.
- In this repository, rolling back the draft is reverting the commit that added `protocol/v3-draft/` and the CI job; no 1.0 or 2.0 file needs to change.
