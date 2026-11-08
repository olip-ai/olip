---
id: intro
title: Introduction
slug: /
description: What OLIP (the Open Legal Intake Protocol) is, why it exists, who it is for, and what exists today.
---

# Introduction to OLIP

**OLIP, the Open Legal Intake Protocol, is a proposed open protocol for authorized, interoperable legal intake of client and case data between AI agents and legal-professional systems, approved by the person for each recipient.** Version 0.1 is a [draft for review](/spec/status/).

A person asks an AI assistant for help with a legal problem. Sooner or later, the assistant needs to answer four questions honestly:

1. **Who is this legal professional, and how do we know?** (professional evidence)
2. **Do they take this kind of matter, here, in this language?** (intake eligibility)
3. **What exactly may be shared, with whom, and until when?** (CaseBrief and consent)
4. **What actually happened after the person pressed "send"?** (delivery and status)

Today every assistant, directory and firm intake form answers those questions differently, often vaguely. OLIP defines one small, shared vocabulary for them: JSON objects with JSON Schemas, an HTTPS binding described in OpenAPI 3.1, and bindings for MCP tools and A2A messages.

## The six modules

| Module | Question it answers | Guide |
|---|---|---|
| Professional identity and licensing evidence | Who is this, and what is the evidence, from which source, as of when? | [Professional evidence](/docs/modules/professional-evidence/) |
| Intake eligibility | What does the professional say they accept, and how fresh is that? | [Intake eligibility](/docs/modules/intake-eligibility/) |
| CaseBrief | What did the person say, in a minimal, editable form? | [CaseBrief](/docs/modules/casebrief/) |
| Consent and authorization | Which one recipient, which exact fields, which purpose, until when? | [Consent and authorization](/docs/modules/consent-and-authorization/) |
| Authenticated delivery | How do only the approved fields get there once, with a verifiable receipt? | [Authenticated delivery](/docs/modules/authenticated-delivery/) |
| Status lifecycle | What happened, stated without overstatement? | [Status lifecycle](/docs/modules/status-lifecycle/) |

## Three rules that run through everything

- **Evidence is labeled, never upgraded.** A copied dataset record is not a verified license. A lawyer's own description of their practice is not a certification.
- **Only the person approves.** The calling agent can prepare, preview and submit, but it cannot approve. Approval names one recipient and is bound to a digest of the exact content.
- **Each status means one thing.** `recorded` is not `sent`, `sent` is not `delivered`, `delivered` is not read, a reply is not acceptance, and nothing in OLIP is an attorney-client relationship.

## Who this site is for

- **AI agent and legal-tech developers:** start with the [Quickstart](/docs/quickstart/) (fictional data, runs locally in minutes).
- **Law firms and intake vendors:** read [For law firms](/docs/context/for-law-firms/) and [Build an independent implementation](/docs/implementing/independent-implementation/).
- **Standards reviewers:** read the [specification](/spec/0.1/), the [threat model](/spec/threat-model/) and the [open questions](/spec/proposals/).
- **Consumers and policy professionals:** read [Legal and ethical boundaries](/docs/context/legal-and-ethical-boundaries/) and the [FAQ](/docs/context/faq/).

## What exists today

Everything listed here is described as it is, on the date of this build. See [Implementations](/implementations/) for the full matrix.

- A complete **0.1 draft** text, 16 JSON Schemas, an OpenAPI 3.1 document, a normative status machine and 14 fictional examples that validate against the schemas.
- Two **local mock endpoints** (Node and Python), an **MCP adapter** with no approve tool, an **A2A binding** (not yet tested against an official A2A SDK), and a **conformance suite** of 30 checks for 0.1 plus 5 for 0.2. Both endpoints pass on the sponsor's machines.
- **Not yet:** a hosted sandbox, published SDK packages, an independent implementation by another organization, an outside security review, counsel review of the illustrative jurisdiction rules, and trademark clearance of the name.

OLIP was initiated and is initially sponsored by Digital Crossings Inc. The specification is proposed and open to independent contributors. Implementing it requires nothing from Digital Crossings Inc. See [Governance](/governance/).
