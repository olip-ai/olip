---
id: independent-implementation-invitation
title: Invitation to build an independent implementation
description: An open invitation and verification checklist for a clean-room, independent OLIP implementation - what counts as independent, what evidence to send, and how it is listed.
---

# Invitation to build an independent implementation

OLIP needs at least two implementations by **different organizations** before it can move past draft. Today there are none: both reference endpoints have the same author. If you build agents, intake software, legal-aid tools or security tooling, this is an open invitation.

## What counts as independent

- [ ] Built from the published [specification](/spec/0.1/), [schemas](/spec/downloads/) and [OpenAPI](pathname:///spec/0.1/openapi/olip-0.1.json), **not** by copying `reference/server.mjs` or `alt-python/`.
- [ ] Runs on your own infrastructure, with no sponsor-controlled backend behind it.
- [ ] Built by people who are not employed or paid by the sponsor for this work (say so if they are).

## What to send

- [ ] The unedited conformance `results.json` and the suite hash ([how](/docs/contributing/self-test/)).
- [ ] The run log (command, date, runtime, operating system).
- [ ] Where the spec was unclear, wrong or hard to implement. This feedback is the main point.
- [ ] Permission to list your implementation and to quote your feedback, or a request to keep it private.

## What you get

A listing on [Implementations](/implementations/) on equal terms, credit in the decision log for any change your feedback causes, and nothing else: no fee, no badge, no endorsement in either direction.

The sponsor contacts potential implementers individually and only with their consent; it does not publish names, affiliations or counts of anyone who has not agreed in writing.
