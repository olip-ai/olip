---
id: index
title: The six modules
slug: /modules/
description: OLIP's six separable modules - professional evidence, intake eligibility, CaseBrief, consent, authenticated delivery and status - and how they fit together.
---

# The six modules

OLIP 0.1 is split into six separable functions. An implementation can start with the first two (the `olip-read` profile) and add the rest later (`olip-write`).

| # | Module | Schema(s) | Profile |
|---|---|---|---|
| 1 | [Professional identity and licensing evidence](/docs/modules/professional-evidence/) | [`professional-identity.json`](pathname:///spec/0.1/schemas/professional-identity.json) | read |
| 2 | [Intake eligibility](/docs/modules/intake-eligibility/) | [`intake-policy.json`](pathname:///spec/0.1/schemas/intake-policy.json) | read |
| 3 | [CaseBrief](/docs/modules/casebrief/) | [`casebrief.json`](pathname:///spec/0.1/schemas/casebrief.json) | write |
| 4 | [Consent and authorization](/docs/modules/consent-and-authorization/) | [`handoff-preview.json`](pathname:///spec/0.1/schemas/handoff-preview.json), [`authorization.json`](pathname:///spec/0.1/schemas/authorization.json), [`policy-gate.json`](pathname:///spec/0.1/schemas/policy-gate.json) | write |
| 5 | [Authenticated delivery](/docs/modules/authenticated-delivery/) | [`handoff.json`](pathname:///spec/0.1/schemas/handoff.json), [`receipt.json`](pathname:///spec/0.1/schemas/receipt.json) | write |
| 6 | [Status lifecycle](/docs/modules/status-lifecycle/) | [`status-event.json`](pathname:///spec/0.1/schemas/status-event.json), [`status-machine.json`](pathname:///spec/0.1/status-machine.json) | write |

The modules map to the three steps on the home page: **Discover** (1, 2), **Authorize** (3, 4), **Connect** (5, 6).

The normative text for each module is in [spec section 5](/spec/0.1/#5-the-six-modules). The guides below explain the design and show fictional examples; where a guide and the spec differ, the spec wins.
