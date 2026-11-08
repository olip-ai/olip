---
id: publish-results
title: Publish your conformance results
description: How to publish an OLIP conformance result truthfully and get an implementation listed on equal terms - free, no badge, no certification.
---

# Publish your conformance results

Any implementation can be listed on [Implementations](/implementations/), free and on equal terms. Open an issue at [github.com/olip-ai/olip](https://github.com/olip-ai/olip/issues/new/choose), or send to [notices@esqcopilot.com](mailto:notices@esqcopilot.com?subject=OLIP%20implementation%20listing) with "OLIP implementation listing":

1. Name, link, and who built it (organization).
2. The OLIP version and profiles it implements.
3. The unedited `results.json` from the [public suite](/docs/contributing/self-test/), with the suite file's SHA-256 (shown on [Conformance results](/conformance/)), the date, the mode (test endpoint or fixture-free) and the runtime.
4. Whether it is **independent**: written without copying the sponsor's reference code, and not a wrapper around a sponsor-controlled backend.
5. Permission to list it, and a contact for questions.

**How to describe a result.** Say "passes N of M checks of the OLIP 0.1 public conformance suite (suite hash …, date …)". Do not say "OLIP certified", "OLIP approved" or "OLIP compliant", and do not use any OLIP logo as a badge: there is none.

The sponsor's own products are listed on the same terms and are never counted as independent.
