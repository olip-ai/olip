#!/usr/bin/env node
// OLIP 3.0-draft black-box conformance runner. It speaks only HTTP to the host under test.
//
//   node conformance/run.mjs                       -> starts the reference system (mock and production builds) and tests both
//   node conformance/run.mjs --base <url> [--profile <file.json>] [--label <name>] [--independent]
//
// Each check reports pass, fail, skip (not applicable or missing input) or mock_only (needs the host's mock test hooks,
// so it proves behavior only on a test build). A result is "independent" only when the operator says the host was built
// without the reference code (--independent); the reference host is never reported as independent.
// The profile names FICTIONAL test accounts on the host (sign-in goes through the co-located 2.0-draft endpoints):
// { user: {subject_id, password}, agent: {client_id, client_secret}, other_user: {...}, organization_id, screening_fields, casebrief }.
// Never point this runner at a host holding real client data.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OlipAgentClient, verifyDetached, verifyJournal } from "../sdk/typescript/dist/index.js";
import { OlipLifecycleClient } from "../../v2-draft/sdk/typescript/dist/index.js";
import { createResponseChecker } from "./schema-check.mjs";
import { ROUTES } from "../reference/routes.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
export const DEFAULT_PROFILE = { user: { subject_id: "usr_test_casey", password: "test-only-casey" }, other_user: { subject_id: "usr_test_morgan", password: "test-only-morgan" },
  agent: { client_id: "agt_test_assistant_a", client_secret: "test-only-agent-a-secret" }, organization_id: "org_test_alvarez",
  screening_fields: ["prospective_client.name", "adverse_parties", "matter.category", "matter.jurisdiction"],
  casebrief: { prospective_client: { name: "Conformance Tester (fictional)", contact: "tester@client.example.test" }, adverse_parties: ["Example Landlord LLC (fictional)"], matter: { category: "housing.landlord_tenant", jurisdiction: "US-CA" },
    facts: { summary: "Fictional conformance matter.", key_dates: [] }, goals: "Fictional." } };
const FORBIDDEN = [/(^|[._])approve([._]|$)/i, /(^|[._])(decide|decision)([._]|$)/i, /firm_confirm/i, /confirm_(engagement|consultation)/i, /accept_(offer|engagement)/i, /(^|[._])grant_consent/i, /self_approve/i];

export async function runConformance({ base, profile = DEFAULT_PROFILE, label = base, independent = false }) {
  const checker = createResponseChecker();
  const results = [];
  const record = (id, title, status, detail = null) => results.push({ id, title, status, ...(detail ? { detail } : {}) });
  const actionFor = (method, path) => { const p = path.split("?")[0]; const m = /^\/olip\/v3\/actions\/([^/]+)\/invoke$/.exec(p); if (m && method === "POST") return decodeURIComponent(m[1]); return ROUTES.find((r) => r.method === method && r.actionId && r.re.test(p))?.actionId ?? null; };
  const fetchChecked = async (url, init = {}) => {
    const r = await fetch(url, init); const text = await r.clone().text();
    let body = null; try { body = JSON.parse(text); } catch { /* not JSON */ }
    const u = new URL(url); const a = actionFor(init.method || "GET", u.pathname); if (a && body) checker.check(a, r.status, body);
    return r;
  };
  const anon = new OlipAgentClient(base, { fetch: fetchChecked });
  const check = async (id, title, fn) => { try { const out = await fn(); if (out === "skip" || out?.status === "skip") record(id, title, "skip", out?.detail); else if (out?.status === "mock_only") record(id, title, "mock_only", out.detail); else record(id, title, "pass"); } catch (e) { record(id, title, "fail", String(e.message || e).slice(0, 300)); } };
  const must = (c, msg) => { if (!c) throw new Error(msg); };
  const code = async (p) => { try { await p; return "no_error"; } catch (e) { return e.code; } };

  let man = null, keys = [];
  await check("V3-01", "Agent manifest is served at the well-known path, signed by a published key, and says the draft is not adopted", async () => {
    man = await anon.manifest(); keys = await anon.keys();
    must((await verifyDetached(man, keys)).ok, "manifest signature");
    must(man.release_status === "proposed_draft_not_adopted", "release_status"); must(man.approval?.approval_is_model_callable === false, "approval_is_model_callable must be false");
    must(man.neutrality?.paid_influence === false && man.neutrality?.sponsor_services_required === false && man.neutrality?.sponsor_account_required === false, "neutrality flags");
    must(man.supported_olip_versions.includes("3.0-draft.1"), "supports 3.0-draft.1");
  });
  if (!man) return finish();
  const mock = man.mode === "mock";
  await check("V3-02", "The REST manifest path serves the same content (same etag)", async () => { const r = await anon.request("GET", "/olip/v3/agent-manifest"); must(r.body.etag === man.etag, "etag differs"); });
  await check("V3-03", "Action contracts: published list equals the manifest; no action approves or confirms; firm and admin actions are HTTPS-only", async () => {
    const acts = (await anon.request("GET", "/olip/v3/actions")).body.actions;
    must(JSON.stringify(acts.map((a) => a.id)) === JSON.stringify(man.actions.map((a) => a.id)), "lists differ");
    const v = checker.schemas.get("action-contract");
    for (const a of acts) { must(v(a), `${a.id} contract invalid`); must(!FORBIDDEN.some((re) => re.test(a.id)), `${a.id} looks like an approval`); if (["firm_authoritative", "privileged_admin"].includes(a.effect)) must(a.transports.join() === "https" && !a.principals.includes("agent"), `${a.id} exposed to agents`); }
  });
  await check("V3-04", "OpenAPI 3.1 document and error catalog are served", async () => {
    const o = (await anon.request("GET", "/olip/v3/openapi.json")).body; must(o.openapi === "3.1.0", "openapi version");
    const e = (await anon.request("GET", "/olip/v3/errors")).body.errors; must(e.some((x) => x.code === "USER_APPROVAL_REQUIRED") && e.some((x) => x.code === "FIRM_AUTHORITY_REQUIRED"), "catalog codes");
  });
  await check("V3-05", "An unsupported OLIP-Version header is refused with VERSION_UNSUPPORTED", async () => { const r = await anon.request("GET", "/olip/v3/agent-manifest", undefined, { "olip-version": "3.0" }); must(r.body?.error?.code === "VERSION_UNSUPPORTED", JSON.stringify(r.body)); });
  await check("V3-06", "Discovery is unpaid and alphabetical", async () => { const r = await anon.findProfessionals({ jurisdiction: "US-CA" }); must(r.ordering.paid_influence === false, "paid_influence"); const n = r.professionals.map((x) => x.display_name); must(JSON.stringify(n) === JSON.stringify([...n].sort((a, b) => a.localeCompare(b))), "order"); });
  await check("V3-07", "Workflow reads need a token", async () => { must((await code(anon.getWorkflow("wf_any"))) === "AUTH_REQUIRED", "no token accepted"); });

  // Sign in through the co-located 2.0-draft endpoints with the profile's FICTIONAL accounts.
  async function signIn(u) { const user = new OlipLifecycleClient(base); await user.negotiate(); await user.userSession(u.subject_id, u.password); const d = await user.delegateAgent(profile.agent.client_id, true); const ai = new OlipLifecycleClient(base); await ai.negotiate(); await ai.agentToken(profile.agent.client_id, profile.agent.client_secret, d.delegation_code); return { user2: user, user: new OlipAgentClient(base, { fetch: fetchChecked, token: user.token }), agent: new OlipAgentClient(base, { fetch: fetchChecked, token: ai.token }), ai }; }
  let me = null;
  try { me = await signIn(profile.user); } catch (e) { record("V3-08", "Sign in with the profile's fictional accounts", "skip", `sign-in unavailable: ${e.message}`.slice(0, 200)); }
  if (!me) return finish();
  if (!mock) {
    await check("V3-08", "Production build: regulated writes fail closed while no jurisdiction is approved by counsel", async () => { const c = await code(me.agent.startWorkflow(profile.casebrief)); must(c === "POLICY_UNREVIEWED", `got ${c}`); });
    return finish();
  }
  let wf = null;
  await check("V3-08", "Starting a workflow needs an Idempotency-Key, and the same key replays the same workflow", async () => {
    const r = await me.agent.request("POST", "/olip/v3/workflows", { casebrief: profile.casebrief, fictional: true }); must(r.body?.error?.code === "IDEMPOTENCY_KEY_REQUIRED", "missing key accepted");
    const a = await me.agent.startWorkflow(profile.casebrief, { idempotencyKey: "conformance-start-0001" }); const b = await me.agent.startWorkflow(profile.casebrief, { idempotencyKey: "conformance-start-0001" });
    must(a.workflow.workflow_id === b.workflow.workflow_id && b.idempotent_replay === true, "no replay"); wf = a.workflow;
  });
  if (!wf) return finish();
  await check("V3-09", "Event journal: chain and signatures verify; a forged cursor is refused", async () => {
    const page = await me.agent.listEvents(wf.workflow_id); must((await verifyJournal(page.entries, keys)).ok, "journal");
    const [c, , mac] = page.next_cursor.split("."); must((await code(me.agent.listEvents(wf.workflow_id, { cursor: `${c}.${Buffer.from('{"w":"x","s":0}').toString("base64url")}.${mac}` }))) === "SCHEMA_INVALID", "forged cursor accepted");
  });
  let pv = null;
  await check("V3-10", "Preview sends nothing; sending before the user approves returns USER_APPROVAL_REQUIRED; the assistant cannot approve", async () => {
    pv = (await me.agent.previewDisclosure(wf.workflow_id, profile.organization_id, "screening", profile.screening_fields)).disclosure;
    must((await code(me.agent.submitApprovedDisclosure(pv))) === "USER_APPROVAL_REQUIRED", "sent without approval");
    const self = await me.ai.request("POST", `/olip/v2/approvals/${pv.approval.approval_id}/decision`, { decision: "approve", otp: "000000", grant_digest: pv.approval.grant_digest }); must(self.status === 403, `agent approval status ${self.status}`);
  });
  await check("V3-11", "A changed approval digest is refused", async () => { if (!pv) return "skip"; must((await code(me.agent.invoke("olip.submit_approved_disclosure", { disclosure_id: pv.disclosure_id, grant_id: pv.approval.grant_id, grant_digest: "sha256:" + "6".repeat(64) }))) !== "no_error", "accepted"); });
  await check("V3-12", "After the user approves (mock inbox), the disclosure is sent once; a retry with the same key replays", async () => {
    if (!pv) return "skip";
    const page = await me.user2.getApproval(pv.approval.approval_id);
    const ob = await (await fetch(`${base}/mock/v2/outbox`)).json(); const otp = ob.messages.filter((m) => m.approval_id === pv.approval.approval_id).at(-1).code;
    await me.user2.decide(pv.approval.approval_id, "approve", otp, page.approval.grant_digest);
    const s1 = await me.agent.submitApprovedDisclosure(pv, { idempotencyKey: "conformance-send-0001" }); const s2 = await me.agent.submitApprovedDisclosure(pv, { idempotencyKey: "conformance-send-0001" });
    must(s1.delivery?.state && s2.idempotent_replay === true, "no replay");
    return { status: "mock_only", detail: "uses the host's mock inbox to read the user's one-time code" };
  });
  await check("V3-13", "A client agent cannot record a firm event", async () => { must((await code(me.agent.invoke("olip.record_firm_event", { object_type: "matter", object_id: wf.matter_id, event: { event_type: "matter.closed" } }))) === "FIRM_AUTHORITY_REQUIRED", "accepted"); });
  let cap = null;
  await check("V3-14", "Only the signed-in user exports a capsule; it validates, and a tampered copy fails", async () => {
    must((await code(me.agent.exportCapsule({ workflow_id: wf.workflow_id, include_fields: ["matter.category"], purpose: "personal_record" }))) === "USER_APPROVAL_REQUIRED", "agent exported");
    cap = (await me.user.exportCapsule({ workflow_id: wf.workflow_id, include_fields: ["matter.category"], purpose: "continue_with_another_assistant" })).capsule;
    must((await me.agent.validateCapsule(cap)).ok, "own capsule invalid"); must(!(await me.agent.validateCapsule({ ...cap, matter_ref: "wf_other" })).ok, "tamper not detected");
  });
  await check("V3-15", "Import needs the user's authorization, creates no approvals, and works once", async () => {
    if (!cap) return "skip";
    must((await code(me.agent.importCapsule(cap, "iau_none"))) === "USER_APPROVAL_REQUIRED", "imported without authorization");
    const auth = (await me.user.authorizeImport(cap.capsule_id, cap.capsule_digest, profile.agent.client_id)).import_authorization;
    const imp = await me.agent.importCapsule(cap, auth.import_authorization_id); must(imp.grants_created === 0, "grants created");
    must((await code(me.agent.importCapsule(cap, auth.import_authorization_id))) === "REPLAY_DETECTED", "reused");
  });
  await check("V3-16", "The planner is deterministic and says it is not authorization", async () => { const a = await me.agent.planNextActions(wf.workflow_id), b = await me.agent.planNextActions(wf.workflow_id); must(a.plan_digest === b.plan_digest && a.not_authorization === true && a.not_legal_advice === true, "plan"); });
  await check("V3-17", "Callback URLs that point at internal addresses are refused", async () => { must((await code(me.agent.subscribe(wf.workflow_id, "https://169.254.169.254/latest"))) === "CALLBACK_URL_REJECTED", "accepted"); }); // scan-publication: allow (SSRF conformance check)
  await check("V3-18", "Another user's assistant cannot see this workflow (NOT_FOUND)", async () => { if (!profile.other_user) return "skip"; const other = await signIn(profile.other_user); must((await code(other.agent.getWorkflow(wf.workflow_id))) === "NOT_FOUND", "visible"); });
  return finish();

  function finish() {
    results.push({ id: "V3-SCHEMA", title: `Every checked response matched the published schemas (${checker.checked} responses)`, status: checker.problems.length ? "fail" : "pass", ...(checker.problems.length ? { detail: JSON.stringify(checker.problems.slice(0, 3)) } : {}) });
    const summary = Object.fromEntries(["pass", "fail", "skip", "mock_only"].map((s) => [s, results.filter((r) => r.status === s).length]));
    return { olip_version: "3.0-draft.1", target: label, base, mode: man?.mode ?? null, independent_implementation: independent, statement: "Self-test of a proposed draft. Passing is not certification, adoption, or a security review.", summary, results };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const base = arg("--base");
  const out = [];
  if (base) out.push(await runConformance({ base, profile: arg("--profile") ? JSON.parse(readFileSync(arg("--profile"), "utf8")) : DEFAULT_PROFILE, label: arg("--label") || base, independent: process.argv.includes("--independent") }));
  else {
    const { startV3System } = await import("../reference/system.mjs");
    const sys = await startV3System({ webhooks: { baseDelayMs: 5, maxAttempts: 2 } });
    out.push(await runConformance({ base: sys.base, label: "reference-mock" })); await sys.stop();
    const prod = await startV3System({ mode: "production" });
    out.push(await runConformance({ base: prod.base, label: "reference-production-build" })); await prod.stop();
  }
  mkdirSync(join(here, "results"), { recursive: true });
  for (const r of out) {
    const stable = { ...r, base: r.base.replace(/:\d+$/, ":<port>") };
    writeFileSync(join(here, "results", `${r.target.replace(/[^a-z0-9.-]+/gi, "_")}.json`), JSON.stringify(stable, null, 2) + "\n");
    console.log(`${r.target}: ${r.summary.pass} pass, ${r.summary.fail} fail, ${r.summary.skip} skip, ${r.summary.mock_only} mock-only (independent: ${r.independent_implementation})`);
    for (const x of r.results.filter((y) => y.status !== "pass")) console.log(`  ${x.status.padEnd(9)} ${x.id} ${x.title}${x.detail ? ` — ${x.detail}` : ""}`);
  }
  process.exit(out.some((r) => r.summary.fail) ? 1 : 0);
}
