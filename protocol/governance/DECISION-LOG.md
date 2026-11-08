# Decision log

| # | Date | Decision | Why | Owner | Review |
|---|---|---|---|---|---|
| D-01 | 2026-11-06 | OLIP defines legal semantics only; reuse HTTPS, OAuth 2.0, JWKS/Ed25519, JSON Schema, OpenAPI, MCP, A2A | Spec says reuse transport; fewer things to trust | Sponsor (draft editor) | Council |
| D-02 | 2026-11-06 | Two topologies (direct, relay); `delivered` requires a recipient-signed receipt | Stops "stored" or "emailed" being reported as delivered (live gap found in the sponsor's own engine) | Sponsor | Council |
| D-03 | 2026-11-06 | Only user approval method in 0.1 is `hosted_otp` (code to the user's own email); `platform_attestation` reserved | The client must never be able to approve alone. Assistants that cannot open a page need a signed platform attestation design first | Sponsor | 0.2 |
| D-04 | 2026-11-06 | `recorded` state added before `queued` | Distinguishes "stored and held" from "scheduled", as the V7 instructions require | Sponsor | Council |
| D-05 | 2026-11-06 | No ranking in the standard; discovery ordering must be disclosed with `paid_influence: false` | Neutrality; payment must not influence contact | Sponsor | Council |
| D-06 | 2026-11-06 | Jurisdiction rules in the reference are illustrative and marked `pending_counsel_review`; production write traffic needs `counsel_approved` | No legal conclusion without counsel | Owner (counsel) | Before any production write |
| D-07 | 2026-11-06 | SALI LMSS mapping left empty (`unmapped_pending_review`) | Official IRIs were not checked; invented IRIs are false data | Sponsor | When LMSS release is checked |
| D-08 | 2026-11-06 | Schema ids use `spec.olip.invalid` | No domain owned; `.invalid` cannot collide | Owner | After domain decision |
| D-09 | 2026-11-07 | Schema ids move to `https://olip.ai/spec/0.1/schemas/` | Owner confirmed the olip.ai registration at Hostinger (11/7). Schemas, validator and conformance updated together; tests rerun | Sponsor | When the site is live (ids resolve only after publication) |
| D-10 | 2026-11-07 | Publish documentation at olip.ai as a static site with no analytics, cookies or third-party scripts | Open access with minimal visitor data | Sponsor | Council |
| D-11 | 2026-11-07 | Licenses granted: CC BY 4.0 with the OWFa 1.0 patent commitment for the specification and schemas; Apache 2.0 for the reference code and conformance suite; CC0 1.0 for fictional examples | Owner (counsel) granted the proposed licenses on 2026-11-07 | Owner | Council |
| D-12 | 2026-11-07 | Name "OLIP": owner states the name is cleared for use | Owner statement on 2026-11-07. No trademark registration is claimed | Owner | Council |
| D-13 | 2026-11-07 | OLIP 0.2 adds key bindings (closes O-04 at the format level), signed status webhooks (closes O-02) and the intake capability card (from proposal P-02); everything in 0.1 is unchanged | Owner instruction 2026-11-07; additive so 0.1 clients keep working | Owner | Council |
| D-14 | 2026-11-07 | OLIP is offered to MCP clients as an "OLIP over MCP" profile (agent-side adapter), not as an MCP protocol extension | MCP stays a transport; OLIP keeps its own legal semantics and versioning | Sponsor | Council |
| D-15 | 2026-11-07 | Implementer change requests CR-01 to CR-06, CR-08 and CR-09 adopted in 0.2 (fixture-free read mode, W1 skipped for read-only endpoints, R6 stale part skipped without a stale fixture, neutral R3, R4 and R5 checks, operations errata, optional manifest `spec` and `limitations`); CR-07 deferred to 1.0 as O-09. The 0.1 files are not edited | A read adapter for a sponsor-associated product found checks that tested the mock's behavior instead of 0.1 rules; published 0.1 hashes stay valid | Sponsor | Council |

## Open items
- O-01 Platform-attested approval (signed by an assistant platform) without weakening T1.
- O-02 Signed status webhooks for relays. **Addressed in 0.2 (D-13).**
- O-03 Encrypted payload envelope (JWE) for relay transports.
- O-04 Binding a recipient's signing key to its license record and firm identity. **Format addressed in 0.2 (D-13); strong evidence methods still need real registries.**
- O-05 Document transfer (out of scope in 0.1).
- O-06 Firms with many professionals and shared intake.
- O-07 Independent security review (gate V7.1).
- O-08 A genuinely independent implementation by another organization (gate V7.2).
- O-09 A license entry with a known state but an unknown number (`license_id: null`, CR-07). Deferred to 1.0 because it changes a 0.1 schema.
