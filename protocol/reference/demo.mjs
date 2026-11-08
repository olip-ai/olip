#!/usr/bin/env node
// Complete FICTIONAL handoff with the Node reference client against any OLIP mock endpoint.
// Usage: node reference/demo.mjs [base]   (default http://127.0.0.1:8787)
import { OlipClient, checkReceipt, mockUserApproves } from "./client.mjs";
import { randomUUID } from "node:crypto";

const base = process.argv[2] || "http://127.0.0.1:8787";
const say = (s) => console.log(s);
const fx = await fetch(`${base}/mock/fixtures`).then((r) => r.json());
const agent = new OlipClient(base, fx.clients.a);
await agent.login();

say("1. The user writes in plain English.");
const d = (await agent.discover({ q: "My landlord is trying to evict me", jurisdiction: fx.jurisdiction_supported })).body;
say(`   Read as: ${d.interpretation.matter_candidates.map((c) => `${c.label} (${c.confidence}, side: ${c.client_side.value ?? "unknown"})`).join("; ")}`);
say(`   Still unknown: ${d.interpretation.unknowns.map((u) => u.question).join(" | ")}`);
say(`2. Unranked list (${d.ordering.disclosure})`);
for (const r of d.results) say(`   - ${r.display_name}: ${r.licenses[0].display_statement} Intake: ${r.intake_endpoint_status}.`);
const choice = fx.professionals.direct_ok;
say(`3. The user picks ${d.results.find((r) => r.id === choice).display_name}. Draft CaseBrief, nothing sent.`);
const email = `demo.${randomUUID().slice(0, 6)}@example.test`;
const cb = (await agent.createBrief({ fictional: true, client: { name: "Demo User (fictional)", email }, location: { jurisdiction: fx.jurisdiction_supported }, matter: { code: fx.matter_supported },
  summary: "Fictional: I received a notice to leave my apartment in 10 days.", key_dates: [{ label: "Notice date (fictional)", date: "2026-11-30", kind: "deadline", certainty: "user_reported" }] })).body.casebrief;
const pv = (await agent.preview({ casebrief_id: cb.id, recipient_id: choice, fields: ["summary", "client.name", "client.email", "location.jurisdiction", "matter.code", "key_dates"], selection: { by: "user" } })).body.preview;
say(`4. Preview for exactly one recipient: ${pv.recipient.display_name}. Shared: ${pv.shared_fields.map((f) => f.label).join(", ")}. Not shared: ${pv.withheld_fields.join(", ") || "nothing"}.`);
const ap = await mockUserApproves(base, pv, email);
say(`5. The user approves on their own page with an emailed code (mock inbox): ${ap.ok ? "approved" : "FAILED"}.`);
const auth = (await agent.getPreview(pv.preview_id)).body.preview.authorization_id;
const key = randomUUID();
const h = (await agent.submit({ authorization_id: auth, consent_digest: pv.consent_digest }, key)).body.handoff;
const again = (await agent.submit({ authorization_id: auth, consent_digest: pv.consent_digest }, key)).body;
const jwks = (await agent.keys()).body;
say(`6. Submitted. State: ${h.state}. ${h.state_meaning}`);
say(`   Receipt signature and digest check: ${checkReceipt(h.receipt, jwks, { consent_digest: pv.consent_digest, payload: h.payload }).ok ? "valid" : "INVALID"}. Retry with same key: replay=${again.idempotent_replay}, same id=${again.handoff.handoff_id === h.handoff_id}.`);
say(`   ${h.engagement.statement}`);
