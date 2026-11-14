# User consent UX

Status: **implemented (reference approval page), tested (automated checks), mock only.** No manual accessibility review has been done.

## Principles

1. **The user sees exactly what is shared.** The approval page shows:
   - the recipient's display name and organization ID
   - the purpose
   - the stage
   - every field with its exact value
   - every offer document with its title and SHA-256
   - the message text, or the offer version and digest
   - the expiry
2. **The user approves with something the assistant does not have.** A one-time code goes to the user's own contact. The assistant never sees it, and three wrong tries lock the request.
3. **Declining is as easy as approving.** "Approve" and "Do not approve" are side-by-side buttons on the same form.
4. **No carry-over.** An approval covers one recipient, one purpose and one use. The page says so.
5. **Plain statements of status.** "Requested" never reads as "confirmed". "Accepted by transport" never reads as "delivered". "Firm reports engagement confirmed" is attributed to the firm.

## Approval page contents (reference)

The firm's per-field "why we ask" text is published with its screening questions (`GET /olip/v2/recipients/{id}/intake-questions`) for the assistant to show before it prepares a request; the approval page itself lists field paths and values.


| Element | Requirement | Tested |
|---|---|---|
| Heading naming the action and recipient | Required | yes |
| Table of every field path and its exact value | Required; values are HTML-escaped | yes |
| Offer version, terms, fees, validity and document digests (engagement only) | Required | yes |
| Check code (the grant digest) | Shown so the user can compare it with what the assistant reports | yes |
| Fixed notice: "Sharing this does not create an attorney-client relationship. The organization decides whether to take the matter." | Required for intake | yes; wording awaiting counsel review |
| Expiry time | Required | yes |
| Code input with a visible label | Required | yes |
| "Approve" and "Do not approve" buttons | Required, side by side | yes |
| Language attribute, main landmark, labeled code input, strict Content-Security-Policy | Automated accessibility check | yes (one automated test) |

Test: consent "approval page is accessible, labeled and shows exactly what is shared".

## Flows

### Screening

The assistant prepares the request and the user sees the page. The user approves, and the assistant submits. The firm then returns one of three outcomes: eligible, information requested (only the named field), or unable to proceed (polite firm text only).

### Fuller CaseBrief

This flow is only offered after the firm says intake may continue. The page lists every CaseBrief field and value.

### Consultation

The user picks a firm-offered time. The page shows the local time in the user's zone, the firm's zone, and the UTC instant. "Requested" stays "requested" until the firm confirms with a reference.

### Engagement

The page shows the offer version, terms summary, fee summary, documents with digests, and `valid_until`. Accepting or declining covers that exact version only. If the firm changes the offer, the old page stops working.

### Messages

Each substantive message gets its own approval, which shows the exact text. Logistics pre-authorization lists the fixed templates, the maximum number of uses and the expiry, and can be revoked.

## States the user sees

The display text for every state is the `meaning` field in the state-machine file (`status-machines/*.json`). Hosts and clients show that text rather than writing their own. Examples:

| State | Text shown |
|---|---|
| `intake.screening_requested` | "The user approved a minimal screening disclosure and the organization's endpoint signed a receipt for it. Nobody at the organization has decided anything yet." |
| `intake.eligible_for_further_intake` | "The organization says intake may continue. This is NOT a conflict clearance finding and NOT representation." |
| `consultation.options_offered` | "The organization offered specific times. Offered is not booked." |
| `consultation.proposed` | "The user picked one offered time. It is not confirmed until the organization confirms it." |
| `engagement.user_accepted` | "The user accepted this exact offer version on the approval surface. The organization has not confirmed." |
| `engagement.firm_confirmed` | "Firm reports engagement confirmed", with the source, time and the qualifier "This is the firm's own signed report. OLIP does not create an attorney-client relationship; when one exists is decided by applicable law." |
| `message.accepted_by_transport` | "A relay or transport accepted it. This is NOT delivery." |
| `message.delivered_to_endpoint` | "The recipient's own system signed a receipt for this exact content. Not read." |
| `message.read_by_recipient` | "An authorized recipient participant recorded reading it. Optional; never inferred." |

## Open items

- Manual accessibility review against WCAG 2.2 AA. Status: under design.
- Usability testing with real consumers. Status: under design.
- Translations. Status: under design.
- Counsel review of notice text. Status: awaiting counsel review.
