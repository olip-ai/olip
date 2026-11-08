---
title: Security
description: How to report a security issue in the OLIP specification, schemas or reference code; the disclosure policy; and the security model of the olip.ai site itself.
---

# Security

## Report a vulnerability

The scope and priority areas for an independent review are on [Security review scope](/docs/contributing/security-review-scope/). Reports stay private until a fix or a documented decision.


Email **[notices@esqcopilot.com](mailto:notices@esqcopilot.com?subject=OLIP%20security)** with **"OLIP security"** in the subject line. This is the sponsor's published contact address. A dedicated security address does not exist yet; this page will be updated when one does.

Please include the affected document, schema or file, the version (0.1 or 0.2), steps to reproduce against the **local mock** endpoint, and the impact you expect. Do not open public discussions of unfixed issues.

## Disclosure policy (draft)

- We aim to acknowledge reports within 3 business days and triage within 10.
- Coordinated disclosure within 90 days, or sooner by agreement.
- Specification-level flaws (for example a consent bypass) get a public advisory, a new conformance test and a patched spec version.
- **Safe harbor** for good-faith research against the local mock endpoints and fictional data only. Never test against a production endpoint with real data, and never send a real contact request to a real lawyer to test.

## Scope

| In scope | Out of scope |
|---|---|
| The OLIP specification, schemas, status machine and OpenAPI document | Third-party implementations (report to their operators) |
| The reference endpoints, clients, MCP adapter and conformance suite in the kit | The sponsor's commercial products (report through those products) |
| This website | Social engineering, denial-of-service testing |

## Security model of the specification

See [Security considerations](/spec/security-considerations/), the [threat model](/spec/threat-model/) and the [implementer checklist](/docs/implementing/privacy-and-security/#checklist). These were written by the sponsor and **have not been independently reviewed**.

## This website

olip.ai is a static documentation site. It runs no server-side code, has no logins or forms, stores no CaseBriefs or client files, and loads no third-party scripts, fonts or analytics. The [schema validator](/validator/) runs entirely in your browser; nothing you paste is sent anywhere. It does not host an OLIP endpoint.
