---
id: report-an-error
title: Report an error
description: How to report a mistake in the OLIP specification, schemas, examples, reference code or this website, and what happens next.
---

# Report an error

Errors in the text, a schema, an example, the reference code, the conformance suite or this website are all welcome.

1. Check the [changelog](/changelog/) and [status](/spec/status/) to see whether it is already known.
2. Write down: the page or file (with its version, for example `spec/0.1/schemas/casebrief.json`), what you expected, what you found, and how to reproduce it.
3. Open an issue at **[github.com/olip-ai/olip/issues](https://github.com/olip-ai/olip/issues/new/choose)** and pick the matching form. If you prefer email, send it to **[notices@esqcopilot.com](mailto:notices@esqcopilot.com?subject=OLIP%20error%20report)** with "OLIP error report" in the subject. Security problems go to the [security policy](/security/), never to a public issue.

Never include real client, case or lawyer data. Use the fictional examples.

**Security problems** (anything that could expose data, bypass approval, forge a receipt or replay a handoff) go privately to the [security contact](/security/), never to a public channel.

**What happens next.** Editorial fixes are made directly and logged in the changelog. Anything that changes behavior or meaning follows [Propose a change](/docs/contributing/propose-a-change/). Published 0.1 files are never edited in place, so their hashes stay valid; fixes go into a new version.
