// Writes fictional example documents for every schema, taken from a real run of the reference system (Scenario A, relay topology),
// plus invalid examples made by breaking one rule each. tests/schemas.test.mjs checks that valid ones pass and invalid ones fail.
// Everything here is FICTIONAL test data.
import { writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { startSystem } from "../reference/system.mjs";
import { runScenarioA } from "../reference/journey.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const got = {};
const keep = (k, v) => { if (v !== undefined && !(k in got)) got[k] = structuredClone(v); };
const sys = await startSystem({ topology: "relay", observe: ({ opId, status, body }) => {
  if (!body || typeof body !== "object") return;
  if (status >= 400) return keep("error", body);
  if (opId === "get_lifecycle_capabilities" || opId === "get_lifecycle_manifest") keep("capabilities", body);
  if (opId === "get_matter" && body.matter?.represented) keep("legal-matter", body.matter);
  if (opId === "list_grants") keep("disclosure-grant", body.grants?.[0]);
  if (opId === "get_approval") keep("approval", body.approval);
  if (opId === "record_conflict_screen_event" && body.conflict_screen?.decision) keep("conflict-screen", body.conflict_screen);
  if (opId === "record_consultation_event" && body.consultation?.confirmation) keep("consultation", body.consultation);
  if (opId === "record_engagement_event" && body.engagement?.state === "firm_confirmed") keep("engagement", body.engagement);
  if (opId === "get_thread") keep("conversation-thread", body.thread);
  if (opId === "get_messages") keep("message", body.messages?.[0]);
  if (opId === "upload_document") keep("document-reference", body.document);
  if (opId === "export_matter_passport") keep("matter-passport", body.passport);
  if (opId === "get_matter_events" && body.entries?.length > 5) { keep("audit-record", body.entries.find((e) => e.attribution === "firm_signed")); keep("lifecycle-event", body.entries.find((e) => e.attribution === "firm_signed")?.event); }
  if (opId === "submit_conflict_screen") keep("delivery-receipt", body.delivery?.receipt);
} });
const r = await runScenarioA(sys);
await r.user.request("GET", `/olip/v2/matters/${r.matter_id}/events`);
await r.user.request("GET", `/olip/v2/matters/${r.matter_id}/grants`);
await r.user.request("GET", "/olip/v2/capabilities");
got["matter-participant"] = got["lifecycle-event"].actor;
got["state-machine"] = JSON.parse(readFileSync(join(root, "status-machines", "consultation.json"), "utf8"));
await sys.stop();

// Each invalid example breaks exactly one rule that matters for safety or interoperability.
const INVALID = [
  ["engagement", "agent_confirmed_state", "An engagement state that does not exist (only the firm's own signed event can confirm).", (x) => { x.state = "confirmed_by_assistant"; }],
  ["engagement", "display_without_qualifier", "Engagement display text with unknown extra claims.", (x) => { x.display_status.attorney_client_relationship = true; }],
  ["disclosure-grant", "unbounded_use", "A grant that claims unlimited uses.", (x) => { x.max_uses = 0; }],
  ["disclosure-grant", "wrong_digest_format", "A grant digest that is not SHA-256 hex.", (x) => { x.grant_digest = "md5:abc"; }],
  ["lifecycle-event", "unsigned", "A firm event with no signature.", (x) => { delete x.signature; }],
  ["lifecycle-event", "issuer_not_scoped", "An event id not scoped to its issuer.", (x) => { x.event_id = "evt-123"; }],
  ["consultation", "time_without_zone", "A confirmed time whose UTC instant does not end in Z.", (x) => { x.confirmation.slot.start_utc = "2026-11-18T10:00:00"; }],
  ["matter-passport", "passport_authorizes_recipient", "A passport that claims to authorize a recipient.", (x) => { x.authorizes_recipients = ["org_test_cedar"]; }],
  ["matter-passport", "passport_transmitted", "A passport that claims it was sent.", (x) => { x.transmitted = true; }],
  ["capabilities", "approval_model_callable", "Capabilities that claim the model can approve.", (x) => { x.approval_is_model_callable = true; }],
  ["capabilities", "sponsor_required", "Capabilities that require sponsor services.", (x) => { x.implementation.sponsor_services_required = true; }],
  ["message", "unknown_delivery_state", "A delivery state OLIP does not define (for example 'seen').", (x) => { x.state = "seen"; }],
  ["document-reference", "public_url", "A document with a public URL member.", (x) => { x.public_url = "https://files.example.test/x.pdf"; }],
  ["error", "no_code", "An error without a stable code.", (x) => { delete x.error.code; }],
  ["audit-record", "broken_hash", "A journal entry whose hash is not a SHA-256 digest.", (x) => { x.entry_hash = "sha256:zz"; }],
];

rmSync(join(root, "examples"), { recursive: true, force: true });
mkdirSync(join(root, "examples", "valid"), { recursive: true }); mkdirSync(join(root, "examples", "invalid"), { recursive: true });
const index = { olip_version: "2.0-draft", fictional: true, statement: "Fictional test data produced by the reference system. Not real people, firms or matters.", examples: [] };
for (const [schema, v] of Object.entries(got).sort()) {
  if (v === undefined) throw new Error(`no example captured for ${schema}`);
  const file = `valid/${schema}.json`; writeFileSync(join(root, "examples", file), JSON.stringify(v, null, 2) + "\n");
  index.examples.push({ file, schema, valid: true });
}
for (const [schema, name, why, mutate] of INVALID) {
  const v = structuredClone(got[schema]); mutate(v);
  const file = `invalid/${schema}.${name}.json`; writeFileSync(join(root, "examples", file), JSON.stringify(v, null, 2) + "\n");
  index.examples.push({ file, schema, valid: false, why });
}
writeFileSync(join(root, "examples", "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`Wrote ${index.examples.length} examples.`);
