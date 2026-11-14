# Firm controls UX

Status: **implemented (reference firm endpoint, no graphical interface), tested, mock only.** A firm-facing screen is under design.

## What the firm controls

| Control | Where it lives | Effect |
|---|---|---|
| Screening allowlist (fields, labels, "why") | Firm profile | The host refuses any other field at screening |
| Fuller CaseBrief fields | Firm profile | Allowed only after the firm says intake may continue |
| Staff and roles | Signed authority document | The host accepts a firm event only from listed, unrevoked, unexpired staff whose role allows that event type |
| Signing keys | Published key set | Rotation and revocation; declaring a key compromised downgrades earlier claims made with it |
| Consultation modes and cancellation text | Firm profile | Shown to the user as the firm's own policy; OLIP sets no policy |
| Offered times | Signed `consultation.options_offered` | Each slot carries an IANA zone and a UTC instant, which must agree |
| Engagement offer | Firm-uploaded, cleared documents plus terms; versioned | The user can accept one exact version |
| Engagement confirmation | Signed `engagement.firm_confirmed` naming the acceptance | Only staff the authority document allows (attorney in the reference policy) |
| Messaging policy | Firm profile | Pre-engagement threads, agent read access, maximum length, logistics templates, closing communications |
| Matter lifecycle | Signed matter events | Inactive, reactivated, closure proposed, closed, terminated (with notice text) |
| Delegated legal software | Authority document | In the reference policy it may record consultation events only |

## Reference role permissions

| Role | May sign |
|---|---|
| intake_staff | intake outcomes, firm messages, read receipts |
| scheduler | consultation events, firm messages, read receipts |
| paralegal | firm messages, read receipts, firm-shared documents |
| attorney | all of the above, plus engagement events, thread membership and matter lifecycle events |

This table is a reference default. Each firm sets its own in its signed authority document.

## Protections for the firm

- No one else, including the relay host, can produce a firm event.
- Contradictory signed events (for example from two offices) are flagged for the firm, never silently resolved.
- AI-drafted firm text is labeled as AI-assisted. It is shown as attorney-reviewed only when the firm names the reviewer.
- A firm sees only its own objects. Guessing another firm's IDs returns 404.

## Open items

- A firm dashboard with a review queue. Status: under design.
- Integration with conflict-check and practice-management systems through the delegated-software role. Status: under design.
