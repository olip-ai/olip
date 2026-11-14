# Progress

As of 2026-11-14. Status words: implemented · tested · mock only · under design · awaiting counsel review · awaiting security review · not deployed · production approved.

## By lifecycle stage

| Stage | What works | Status |
|---|---|---|
| Discovery | Capabilities at two paths; alphabetical recipient registry, `paid_influence: false`; 1.0 manifest advertising on a combined host | implemented, tested, not deployed |
| Conflict-aware intake | Firm screening allowlist; user-approved minimal screening; firm-signed outcomes; additional information limited to the named field; full CaseBrief only after eligibility | implemented, tested, mock only (approval codes), awaiting counsel review (notice wording) |
| Consultation | Request, firm-offered zoned times, proposal, firm confirmation of the exact slot with a reference, reschedule with a higher version, firm-attested attendance with a named source, decline, cancel, expiry | implemented, tested, mock only (no real calendar) |
| Engagement | Versioned offer bound to cleared, hash-matched documents; user accept or decline of one exact version; stale acceptance voided; confirmation only by the firm's authorized attorney naming the acceptance; payment never confirms | implemented, tested, mock only (no real payment or e-signature), awaiting counsel review (electronic assent) |
| Communications | Threads; per-message approval; signed receipts for delivery; read only on the reader's action; firm-signed replies with AI-drafting labels; observers; logistics templates; documents with checks and short-lived downloads | implemented, tested, mock only (malware scan, transport) |
| Matter closure | Inactive, reactivated, closure proposed, closed, terminated; consumer messages refused after closure; firm closing messages allowed; signed portable passport that authorizes nobody | implemented, tested, mock only |

## By component

| Component | Status |
|---|---|
| Normative draft text (`spec/OLIP-2.0-DRAFT.md`) | implemented (written); not adopted |
| State machines and invariants | implemented, tested |
| 18 JSON Schemas, 17 valid and 15 invalid examples | implemented, tested |
| OpenAPI 3.1 (55 operations) | implemented, tested |
| Reference lifecycle host, firm endpoint, both topologies, combined 1.0 + 2.0 host | implemented, tested, mock only, not deployed |
| TypeScript client | implemented, tested |
| Python client and verifier | implemented, tested |
| MCP adapter (official SDK 1.32.2, protocol 2025-11-25) | implemented, tested |
| MCP 2026-07-28 | under design; no official SDK release supports it yet |
| A2A adapter (official SDK 1.3.0, A2A 1.0) | implemented, tested |
| Golden vectors | implemented, tested (JavaScript, Python, TypeScript WebCrypto) |
| Conformance runner | implemented, tested; no independent results |
| Jurisdiction rules | under design, awaiting counsel review |
| Security | awaiting security review |
| CI job | implemented; awaiting first CI run |
| Deployment | not deployed; nothing is production approved |

## What is blocked, and on whom

1. **License grant for 2.0.** The OWFa covers 1.0 only, so extending it is a sponsor decision.
2. **Patent confirmation.** The sponsor needs to confirm that nothing in 2.0 requires Patent Family A methods. The draft adds no search or ranking.
3. **Counsel review.** Notices, consent wording and any jurisdiction's rules await counsel review.
4. **External security review.**
5. **An independent implementer** to run the conformance suite.
