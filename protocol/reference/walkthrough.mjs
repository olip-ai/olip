#!/usr/bin/env node
// OLIP 0.1 quickstart walkthrough. SANDBOX SIMULATION ONLY: fictional people, fictional firms, a local mock endpoint.
// Nothing here can reach a real lawyer: the mock endpoint has no outbound mail or network delivery at all.
// Usage: node reference/walkthrough.mjs [base]   (default http://127.0.0.1:8787)
// Every response is validated against the shipped JSON Schemas; the script exits non-zero on any mismatch.
import { OlipClient, checkReceipt, mockUserApproves } from "./client.mjs";
import { makeValidator } from "../conformance/schema-validator.mjs";
import { randomUUID } from "node:crypto";

const base = process.argv[2] || "http://127.0.0.1:8787";
const validate = await makeValidator();
let failures = 0;
const say = (s = "") => console.log(s);
const check = (name, obj, label) => {
  const r = validate(name, obj);
  say(`     schema ${name}.json: ${r.ok ? "valid" : "INVALID " + r.errors}`);
  if (!r.ok) failures++;
  return r.ok;
};
const expect = (cond, what) => { say(`     ${cond ? "ok" : "UNEXPECTED"}: ${what}`); if (!cond) failures++; };

say("==============================================================");
say(" OLIP 0.1 walkthrough  |  SANDBOX SIMULATION, fictional data");
say(" No message can reach a real lawyer from this mock endpoint.");
say("==============================================================");

const fx = await fetch(`${base}/mock/fixtures`).then((r) => r.json());
const agent = new OlipClient(base, fx.clients.a);
await agent.login();
const manifest = (await agent.manifest()).body;
say(`\n0. Endpoint manifest: profiles ${manifest.profiles?.join(", ")}; versions ${manifest.supported_versions?.join(", ")}`);
check("manifest", manifest);

say("\n1. Discover. The person writes: \"My landlord is trying to evict me\" (state: California).");
const d = (await agent.discover({ q: "My landlord is trying to evict me", jurisdiction: fx.jurisdiction_supported })).body;
check("discovery-response", d);
say(`     ordering: ${d.ordering.disclosure} (paid_influence: ${d.ordering.paid_influence})`);
for (const r of d.results) say(`     - ${r.display_name}: ${r.licenses[0].display_statement}`);

const choice = fx.professionals.direct_ok;
const idn = (await agent.identity(choice)).body;
check("professional-identity-response", idn);
say(`     evidence level for the chosen lawyer: ${idn.professional.licenses[0].verification.level}`);
const pol = (await agent.policy(choice)).body;
check("intake-policy-response", pol);
say(`     intake policy: matters ${pol.intake_policy.matter_types.map((m) => m.code).join(", ")}; accepting new matters = ${pol.intake_policy.accepting_new_matters.value} (${pol.intake_policy.accepting_new_matters.status})`);

say("\n1b. Same question for Wyoming, where no fictional lawyer is listed: a no-match result with free help.");
const nm = (await agent.discover({ matter: fx.matter_supported, jurisdiction: fx.no_match_jurisdiction })).body;
check("discovery-response", nm);
expect(nm.results.length === 0 && nm.no_match && nm.legal_aid_options.length > 0, `no_match: "${nm.no_match?.message}"`);

say("\n2. Draft a CaseBrief. Nothing is transmitted while drafting.");
const email = `walkthrough.${randomUUID().slice(0, 6)}@example.test`;
const brief = { fictional: true, client: { name: "Walkthrough User (fictional)", email }, location: { jurisdiction: fx.jurisdiction_supported },
  matter: { code: fx.matter_supported }, summary: "Fictional: I received a notice to leave my apartment in 10 days.",
  facts: [{ text: "Fictional: I have rented here for two years.", source: "user_reported" }],
  key_dates: [{ label: "Notice date (fictional)", date: "2026-11-30", kind: "deadline", certainty: "user_reported" }] };
const v = (await agent.validate(brief, choice)).body;
expect(v.transmitted === false, `validate says transmitted: ${v.transmitted}`);
const cb = (await agent.createBrief(brief)).body.casebrief;
check("casebrief", cb);

say("\n3. Preview for exactly one recipient, with the exact fields the person selected (facts withheld).");
const FIELDS = ["summary", "client.name", "client.email", "location.jurisdiction", "matter.code", "key_dates"];
const two = await agent.preview({ casebrief_id: cb.id, recipient_ids: [choice, fx.professionals.relay_email], fields: FIELDS, selection: { by: "user" } });
expect(two.status >= 400, `a two-recipient preview is refused (${two.body.error?.code})`);
const pv = (await agent.preview({ casebrief_id: cb.id, recipient_id: choice, fields: FIELDS, selection: { by: "user" } })).body.preview;
check("handoff-preview", pv);
say(`     recipient: ${pv.recipient.display_name}; shared: ${pv.shared_fields.map((f) => f.path).join(", ")}; withheld: ${pv.withheld_fields.join(", ")}`);
say(`     consent digest: ${pv.consent_digest}`);

say("\n4. Failure path: the agent tries to submit before the person approves.");
const early = await agent.submit({ authorization_id: "auz_made_up_by_agent", consent_digest: pv.consent_digest });
check("error", early.body);
expect(early.status >= 400, `refused with ${early.body.error?.code}`);

say("\n5. The person approves on the host's own page with a code sent to their own inbox (mock inbox here).");
const ap = await mockUserApproves(base, pv, email);
expect(ap.ok && ap.digestOnPage === pv.consent_digest, "approved; the page showed the same consent digest");
const auth = (await agent.getPreview(pv.preview_id)).body.preview.authorization_id;

say("\n6. Connect: submit with an Idempotency-Key, then retry with the same key (network-failure case).");
const key = randomUUID();
const sub = (await agent.submit({ authorization_id: auth, consent_digest: pv.consent_digest }, key)).body;
check("handoff", sub.handoff);
const h = sub.handoff;
say(`     state: ${h.state}. ${h.state_meaning}`);
const again = (await agent.submit({ authorization_id: auth, consent_digest: pv.consent_digest }, key)).body;
expect(again.idempotent_replay === true && again.handoff.handoff_id === h.handoff_id, "retry returned the same handoff, no second delivery");
check("receipt", h.receipt);
const jwks = (await agent.keys()).body;
expect(checkReceipt(h.receipt, jwks, { consent_digest: pv.consent_digest, payload: h.payload }).ok, "receipt signature, consent digest and payload hash verify");
const forged = { ...h.receipt, statement: "Lawyer accepted your case" };
expect(!checkReceipt(forged, jwks, { consent_digest: pv.consent_digest }).ok, "a forged 'accepted' receipt fails verification");
say(`     ${h.engagement.statement}`);

say("\n7. Status: a person at the fictional firm records that they viewed it (acknowledged is not acceptance).");
const R = new OlipClient(base, fx.recipients.direct_ok); await R.login();
const ack = (await R.recipientEvent(h.handoff_id, { type: "acknowledged", actor: { kind: "human", role: "staff" }, evidence: { type: "recipient_attestation", ref: "viewed-in-inbox-walkthrough" } })).body;
check("status-event", ack.handoff.events.at(-1));
expect(ack.handoff.state === "acknowledged" && ack.handoff.engagement.status === "unknown", `state ${ack.handoff.state}; engagement ${ack.handoff.engagement.status}`);
const spoof = await agent.recipientEvent(h.handoff_id, { type: "consultation_confirmed", actor: { kind: "human" }, evidence: { type: "recipient_attestation", ref: "x" } });
expect(spoof.status === 403, `the agent cannot record "consultation confirmed" (${spoof.body.error?.code})`);

say("\n8. Withdrawal: the person changes their mind after delivery.");
const c = (await agent.cancel(h.handoff_id)).body;
check("handoff", c.handoff);
say(`     effect: ${c.handoff.cancellation.effect}`);
for (const l of c.handoff.cancellation.limits) say(`     limit: ${l}`);

say("\n9. Failure path: the fictional firm's endpoint is offline.");
const cb2 = (await agent.createBrief({ ...brief, location: { jurisdiction: fx.jurisdictions.offline } })).body.casebrief;
const pv2 = (await agent.preview({ casebrief_id: cb2.id, recipient_id: fx.professionals.offline, fields: FIELDS, selection: { by: "user" } })).body.preview;
await mockUserApproves(base, pv2, email);
const auth2 = (await agent.getPreview(pv2.preview_id)).body.preview.authorization_id;
const h2 = (await agent.submit({ authorization_id: auth2, consent_digest: pv2.consent_digest })).body.handoff;
check("handoff", h2);
expect(["failed", "queued"].includes(h2.state) && h2.receipt === null, `state ${h2.state}, no receipt; never shown as delivered`);

say("\n10. Failure path: a referral-service workflow under the illustrative California rules.");
const blocked = await agent.preview({ casebrief_id: cb.id, recipient_id: choice, fields: FIELDS, mode: "referral_service", selection: { by: "user" } });
check("error", blocked.body);
say(`     ${blocked.body.error.code}: ${blocked.body.error.message}`);
for (const a of blocked.body.error.allowed_alternatives) say(`     alternative (${a.kind}): ${a.description}`);

say("\n11. The person deletes the CaseBrief from the host.");
const del = (await agent.deleteBrief(cb.id)).body;
expect(del.deleted === true, `deleted; limits: ${del.limits.join(" ")}`);

say("\n==============================================================");
say(failures === 0 ? " Walkthrough complete: every step behaved as the draft requires." : ` ${failures} step(s) did not behave as expected.`);
say(" Reminder: this was a sandbox simulation. No real lawyer was contacted.");
say("==============================================================");
process.exit(failures === 0 ? 0 : 1);
