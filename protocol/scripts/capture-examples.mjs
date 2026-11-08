// Regenerates examples/*.json from a live run of the reference mock server (fictional data only).
// Usage: node scripts/capture-examples.mjs [base]
import { writeFileSync } from "node:fs";
import { OlipClient, mockUserApproves } from "../reference/client.mjs";
const base = process.argv[2] || "http://127.0.0.1:8787";
const fx = await fetch(`${base}/mock/fixtures`).then((r) => r.json());
const out = (name, schema, description, example) => writeFileSync(new URL(`../examples/${name}.json`, import.meta.url), JSON.stringify({ schema, fictional: true, description, example }, null, 2) + "\n");
const a = new OlipClient(base, fx.clients.a); await a.login();
out("01-manifest", "manifest", "Endpoint manifest at /.well-known/olip.json.", (await a.manifest()).body);
out("02-discovery-plain-english", "discovery-response", "Public discovery from a plain-English tenant question. Unknowns exposed.", (await a.discover({ q: "My landlord is trying to evict me" })).body);
out("03-discovery-no-match", "discovery-response", "No listed professional fits; legal aid options returned.", (await a.discover({ jurisdiction: "US-WY", matter: "housing.landlord_tenant" })).body);
out("04-identity-verified", "professional-identity-response", "License checked against the (fictional) official source.", (await a.identity(fx.professionals.verified)).body);
out("05-identity-indexed", "professional-identity-response", "License only copied from a dataset; not checked. Unclaimed. No intake endpoint.", (await a.identity(fx.professionals.indexed_only_no_endpoint)).body);
out("06-intake-policy", "intake-policy-response", "What a professional accepts. Unknown values marked.", (await a.policy(fx.professionals.direct_ok)).body);
const email = "sample.user@example.test";
const cb = (await a.createBrief({ fictional: true, time_zone: "America/Los_Angeles", client: { name: "Sample User (fictional)", email }, location: { jurisdiction: "US-CA", county: "Fictional County" },
  matter: { code: "housing.landlord_tenant", user_description: "Notice to leave" }, summary: "Fictional example: I received a 3-day notice from my landlord.",
  facts: [{ text: "Fictional: I have rented this unit for two years.", source: "user_reported" }], objectives: ["Fictional: understand my options."],
  key_dates: [{ label: "Date on notice (fictional)", date: "2026-11-20", time_zone: "America/Los_Angeles", kind: "deadline", certainty: "user_reported" }], documents: [{ ref: "doc_local_1", title: "Photo of notice (kept on device)", label: "confidential", shared: false }], extensions: {} })).body.casebrief;
out("07-casebrief", "casebrief", "Editable CaseBrief draft. Nothing sent.", cb);
const pv = (await a.preview({ casebrief_id: cb.id, recipient_id: fx.professionals.direct_ok, fields: ["summary", "client.name", "client.email", "location.jurisdiction", "matter.code", "key_dates"], selection: { by: "user" } })).body.preview;
out("08-handoff-preview", "handoff-preview", "Exactly one recipient, every shared value, notices, consent digest, approval link.", pv);
const ap = await mockUserApproves(base, pv, email);
out("09-authorization", "authorization", "Single-use approval the user gave on their own page.", ap.body.authorization);
const h = (await a.submit({ authorization_id: ap.body.authorization.authorization_id, consent_digest: pv.consent_digest }, "example-key-0001")).body.handoff;
out("10-handoff-delivered", "handoff", "Delivered to the recipient's intake system with a signed receipt. Not read, not accepted.", h);
out("11-receipt", "receipt", "Recipient receipt, Ed25519-signed over canonical JSON.", h.receipt);
out("12-status-event", "status-event", "One status event (recipient_system, signed).", h.events.at(-1));
const blocked = (await a.preview({ casebrief_id: cb.id, recipient_id: fx.professionals.direct_ok, fields: ["summary"], mode: "referral_service", selection: { by: "user" } })).body;
out("13-error-policy-blocked", "error", "A referral-service workflow blocked by the illustrative California rule, with allowed alternatives.", blocked);
out("14-status-machine", "status-machine", "The canonical status machine.", (await a.req("GET", "/olip/v0.1/status-machine")).body);
console.log("examples written");
