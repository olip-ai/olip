# Migration guide: from OLIP 1.0 to adding 2.0-draft

Status: **implemented, tested** for the reference code. 2.0-draft is a proposal, not an adopted standard, so plan for changes before adoption.

## Nothing breaks

You do not need to change any 1.0 code. 1.0 requests, responses, schemas, states and conformance results stay byte-for-byte the same. 2.0 is opt-in and negotiated.

## For a 1.0 host that wants to add 2.0

1. Serve 2.0 under `/olip/v2` and the capabilities document at `/olip/v2/capabilities` and `/.well-known/olip-lifecycle.json`.
2. Optionally list `olip.ai/lifecycle-capabilities/2.0-draft` in your 1.0 manifest's extensions. Change no other 1.0 field.
3. Keep 1.0 handoff states as they are. Track lifecycle progress on the 2.0 matter, never on the 1.0 handoff.
4. Run the 1.0 conformance suite and the 2.0 runner against the same address. The reference combined host passes both (`reference-compat-1.0-and-2.0`).

## For a 1.0 client or assistant

1. Call negotiate. If lifecycle is false, keep behaving exactly as a 1.0 client.
2. After a 1.0 handoff, the consumer may start a 2.0 matter with the same firm. The 1.0 approval does not carry over: the 2.0 screening needs its own approval (INV-08).
3. Replace any of your own status wording with the host's `meaning` and `display_status` text.

## For a firm

1. Publish an Ed25519 key set and a signed authority document.
2. Publish a minimal screening allowlist.
3. Sign receipts and outcomes. Use the reference firm endpoint as a model.

## Mapping

| 1.0 concept | 2.0-draft concept |
|---|---|
| Handoff approved and delivered to a lawyer | Starting point; 2.0 begins with a new matter and a minimal screening |
| Consumer approval of the handoff brief | One disclosure grant per disclosure, bound by `grant_digest` |
| Professional ID | Organization ID; `olip_1_0_professional_ids` in the firm profile links the two |
| Canonical JSON (1.0 section 9.1) | Identical, by import |
| 1.0 MCP adapter (hand-written) | 2.0 MCP adapter on the official MCP SDK; plus an A2A adapter |

## Likely changes before adoption

- The MCP binding will move to the 2026-07-28 protocol revision once an official SDK supports it.
- The approval method will replace `hosted_otp_mock` with real channels.
- Jurisdiction-specific notice text after counsel review.
