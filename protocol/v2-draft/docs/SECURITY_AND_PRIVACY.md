# Security and privacy

Overall status: **implemented, tested, mock only, awaiting security review, not deployed.** No external security audit has been done. Do not describe OLIP 2.0-draft as security audited.

## Threat model (summary)

| Threat | Control | Status | Test |
|---|---|---|---|
| Assistant approves for the user | Decision endpoint refuses agent tokens; code goes to the user's own contact | tested | consent: "agent fabricates approval"; Scenario D |
| Assistant sends more than was approved | Grant digest over exact fields, values, documents, recipient, revision, nonce, expiry | tested | consent: "client edits the CaseBrief after approval" |
| Approval reused for another firm or a second send | One recipient, one use | tested | consent: "one approval, one recipient" |
| Prompt injection in a CaseBrief or message | Content is data; it cannot create approvals, recipients or sends; adapters label it untrusted | tested | consent: "prompt injection inside the CaseBrief stays inert" |
| Oversharing before a conflict check | Screening allowlist; full CaseBrief only after eligibility | tested | consent: allowlist and casebrief-before-eligibility tests |
| Host or agent forges a firm confirmation | Firm Ed25519 key plus the firm's signed authority document | tested | firm-authority tests 43–51 |
| Staff without the role confirms | Authority document checked by the firm system and by the host | tested | "staff without the role" |
| Revoked staff or compromised key | New authority document; key revocation; earlier claims downgraded at read time | tested | "revoked staff", "key rotation, revocation and compromise" |
| Replay, stale or out-of-order events | Event ID uniqueness, 300-second skew, revision check | tested | "replayed, stale, future and out-of-order" |
| Contradictory signed events | Reconciliation record, never a silent choice | tested | "two validly signed contradictory events" |
| Cross-tenant access | 404 for every object type | tested | tenancy "cross-tenant guessing" |
| False delivery or attendance | Signed receipts; named attendance source | tested | messages and consultation tests |
| Webhook forgery or replay | Host-signed hints; freshness; replay list; changed `kid` refused | tested | tenancy "webhooks" |
| SSRF through callback URLs | HTTPS only; private, loopback, link-local and metadata ranges refused, also after DNS rebinding | tested | tenancy "SSRF checks" |
| Malicious documents | Type allowlist, content sniffing, mock malware scan, size limit, safe names, inert downloads | tested; malware scan **mock only** | messages-documents tests |
| Secrets or sensitive identifiers shared too early | Pattern blocks for SSN, card number, A-number, medical detail, credentials, by stage | tested (pattern-based) | consent and messages tests |
| Log leakage | Logs keep route template, status and code only | tested | tenancy "logs keep only route templates" |
| Data at rest | AES-256-GCM for CaseBriefs and message bodies | tested | tenancy "encrypted at rest" |
| Journal tampering | Hash chain | tested | tenancy "journal is a verifiable hash chain" |
| Abuse | Rate limit, 429 | tested | tenancy "rate limits" |
| Idempotency confusion | Required key; same key with a different body refused | tested | tenancy "mutations require Idempotency-Key" |

## What is not provided

- **End-to-end encryption.** It is not provided. Encryption is at rest on the host only. Status: under design.
- **Real identity proofing and real code delivery.** The approval method is `hosted_otp_mock`. Status: under design.
- **Real malware scanning.** The scan is a mock. Status: mock only.
- **Key custody.** Fictional keys are derived from public labels, so their private halves are public. Production keys need hardware or cloud key custody. Status: under design.
- **Durable storage.** The reference host stores everything in memory. Status: mock only.
- **External penetration test or code audit.** Status: awaiting security review.

## Privacy principles applied

1. **Data minimization by stage.** Screening uses only the firm's minimal allowlist. The fuller brief comes only after eligibility.
2. **Purpose binding.** Every grant names its purpose and stage.
3. **No carry-over.** A passport export authorizes nobody. A new firm starts screening from the beginning.
4. **Status-only observers.** Observers see no content and lose access when removed. Earlier reads cannot be clawed back, and the UI says so.
5. **Retention.** The firm keeps its own records under its own duties. Deleting a host copy does not erase the firm's records, and the host says so.
6. **No inference.** Delivery, reading and attendance are never inferred.

## Reporting

Follow the repository `SECURITY.md`.
