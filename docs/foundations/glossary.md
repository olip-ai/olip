---
id: glossary
title: Glossary
description: Definitions of OLIP terms - CaseBrief, consent digest, recipient, topology, evidence levels, states and more.
---

# Glossary

**Acknowledged.** A person at the recipient recorded viewing the handoff. Automatic replies never count. Not acceptance.

**Agent / client.** Software acting for the user (an AI assistant, app or website). Authenticated, never trusted to approve.

**Allowed alternatives.** The options a blocked policy gate MUST return: contact the firm directly, legal aid, another mode, or a certified referral service.

**Authorization.** A single-use, expiring approval by the user, bound to one consent digest. Not the same as the client's OAuth credentials.

**CaseBrief.** The user-reported, user-editable summary of a legal problem: facts, objectives, location, matter, dates, parties, open questions and document references. Its text is untrusted data. Sometimes called a Matter Passport in sponsor products; OLIP's term is CaseBrief.

**Claim status.** Whether a professional has claimed their profile (`unclaimed`, `claimed_unverified`, `claimed_verified`, `unknown`). Separate from license evidence.

**Consent digest.** `sha256:` over the canonical JSON of the version, recipient, CaseBrief id and revision, purpose, mode, shared fields with values, and notice version. Any change produces a new digest and invalidates the old approval.

**Delivered.** The recipient's intake system stored the handoff and signed a receipt. Not proof that a person read it.

**Display statement.** The fixed sentence about a license that agents MUST show without upgrading it.

**Evidence levels.** `indexed` (copied from a dataset, never checked), `official_source_checked` (compared with the licensing authority's own record on a stated date), `authority_issued_credential` (signed by the authority; none are known to exist today).

**Handoff.** The transmission of approved fields to one recipient, with its events and receipt.

**Host.** The OLIP endpoint that stores the CaseBrief, preview and handoff.

**Idempotency-Key.** A header (8 to 200 characters) required on submit. The same key and body return the same handoff; no second delivery.

**Intake policy.** The professional's own statement of jurisdictions, matter types, client side, languages, capacity, exclusions, required fields, delivery topology and retention, with an update timestamp.

**Manifest.** `/.well-known/olip.json` on an implementer's domain: profiles, supported versions, operations and bindings.

**Mode.** The purpose of the workflow: `consumer_selected_listing`, `direct_firm_intake`, `referral_service`, `automated_routing`.

**Policy gate.** The jurisdiction, mode and recipient checks a host runs before any preview or submit.

**Preview.** The exact proposal shown to the user: one recipient, every shared value, withheld fields, purpose, mode, notices, gate result and consent digest.

**Receipt.** A recipient-signed (Ed25519 over canonical JSON) statement covering the handoff id, payload hash, consent digest, retention and a plain statement.

**Recipient.** One legal professional or firm and its intake system.

**Recorded / queued / sent.** Stored and held / scheduled for transmission / accepted by a transport. None of these means the recipient has it.

**Topology.** `direct` (the recipient's own system is the host) or `relay` (a host forwards over a transport).

**Unknown.** A first-class answer. Implementations MUST NOT fill a guess in as fact.
