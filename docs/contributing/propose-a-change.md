---
id: propose-a-change
title: Propose a change
description: The OLIP normative change process - issue or proposal, public comment, schema, example and test changes, compatibility impact, and a recorded decision.
---

# Propose a change

A **normative** change alters what an implementation must or may do. It follows these steps:

| Step | What is needed |
|---|---|
| 1. Proposal | Problem, proposed text, compatibility impact (which versions and profiles), security and privacy impact, test plan. Use the [proposal format](/spec/proposals/). |
| 2. Public comment | The proposal is published with a comment period. Today the sponsor publishes it on this site; later, in the public repository. |
| 3. Artifacts | The change ships with the schema update, a fictional example and a conformance test. No change is adopted without all three. |
| 4. Decision | Recorded with date and reason in the [decision log](/governance/#decision-log). |
| 5. Release | Additive changes go into the next minor version; published files are not edited in place. See [Versioning](/spec/versioning/). |

**Precedent.** Change requests CR-01 to CR-09 came from building a read adapter and are recorded in decision D-15: eight adopted in 0.2, one deferred to 1.0.

Open a "Protocol change proposal" issue at [github.com/olip-ai/olip](https://github.com/olip-ai/olip/issues/new/choose), or send proposals to [notices@esqcopilot.com](mailto:notices@esqcopilot.com?subject=OLIP%20proposal) with "OLIP proposal" in the subject. You may propose changes without an account with any company, and contributions are licensed as described on [Community](/community/#contributing-changes). Sign off any patch under the Developer Certificate of Origin.

Until an independent governing group exists, the sponsor decides and must publish its reasons. See [Governance](/governance/).
