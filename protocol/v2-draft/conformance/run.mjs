#!/usr/bin/env node
// OLIP 2.0-draft black-box conformance runner. It speaks only HTTP to the host under test.
//
//   node conformance/run.mjs                      -> starts the reference system (relay and direct) and tests both
//   node conformance/run.mjs --base <url> [--profile <file.json>] [--label <name>] [--independent]
//
// Each check reports one of: pass, fail, skip (not applicable or missing input), mock_only (needs the host's mock
// test hooks, so it proves behavior only on a test build). A result is "independent" only when the operator says the
// host was built without the reference code (--independent); the reference host is never reported as independent.
// The profile file names FICTIONAL test accounts on the host: { user: {subject_id, password}, agent: {client_id, client_secret},
// organization_id, screening_fields: [...] }. Never point this runner at a host holding real client data.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { OlipLifecycleClient, verifyDetached } from "../sdk/typescript/dist/index.js";
import { createResponseChecker } from "./schema-check.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const DEFAULT_PROFILE = { user: { subject_id: "usr_test_casey", password: "test-only-casey" }, agent: { client_id: "agt_test_assistant_a", client_secret: "test-only-agent-a-secret" }, organization_id: "org_test_alvarez",
  screening_fields: ["prospective_client.name", "adverse_parties", "matter.category", "matter.jurisdiction"],
  casebrief: { prospective_client: { name: "Conformance Tester (fictional)", contact: "tester@client.example.test" }, adverse_parties: ["Example Landlord LLC (fictional)"], matter: { category: "housing.landlord_tenant", jurisdiction: "US-CA" }, facts: { summary: "Fictional conformance run.", key_dates: [] }, goals: "None (test)." } };

export async function runConformance({ base, profile = DEFAULT_PROFILE, label = base, independent = false }) {
  const checker = createResponseChecker();
  const results = [];
  const record = (id, title, status, detail = null) => results.push({ id, title, status, ...(detail ? { detail } : {}) });
  // Wrap fetch so every response is also checked against the published schemas (opId is inferred from the capabilities' operation list).
  let ops = [];
  const opFor = (method, path) => ops.find((o) => o.method === method && new RegExp("^" + o.path.replace(/\{[^}]+\}/g, "[^/]+") + "$").test(path.split("?")[0]))?.name ?? null;
  const fetchChecked = async (url, init = {}) => {
    const r = await fetch(url, init); const text = await r.clone().text();
    let body = null; try { body = JSON.parse(text); } catch { /* html or bytes */ }
    const u = new URL(url); checker.observe({ opId: opFor(init.method || "GET", u.pathname), status: r.status, body, method: init.method || "GET", route: u.pathname, html: (r.headers.get("content-type") || "").includes("html") });
    return r;
  };
  const anon = new OlipLifecycleClient(base, { fetch: fetchChecked });
  const check = async (id, title, fn) => { try { const out = await fn(); if (out === "skip" || out?.status === "skip") record(id, title, "skip", out?.detail); else if (out?.status === "mock_only") record(id, title, "mock_only", out.detail); else record(id, title, "pass", out?.detail); } catch (e) { record(id, title, "fail", String(e.message || e)); } };
  const must = (c, msg) => { if (!c) throw new Error(msg); };

  let caps = null;
  await check("C-01", "Capabilities document is served, valid, and marks the draft as not adopted", async () => {
    const r = await anon.request("GET", "/olip/v2/capabilities"); must(r.status === 200, `status ${r.status}`); caps = r.body; ops = caps.operations || [];
    must(caps.release_status === "proposed_draft_not_adopted", "release_status"); must(caps.approval_is_model_callable === false, "approval_is_model_callable must be false");
    must(caps.implementation?.sponsor_services_required === false, "sponsor services must not be required");
  });
  if (!caps) return finish();
  const mock = !!caps.mock_hooks;
  await check("C-02", "Well-known lifecycle manifest equals the capabilities document", async () => { const r = await anon.request("GET", "/.well-known/olip-lifecycle.json"); must(JSON.stringify(r.body) === JSON.stringify(caps), "differs"); });
  await check("C-03", "OLIP 1.0 manifest (if served) advertises the lifecycle extension without changing 1.0 versions", async () => {
    const r = await anon.request("GET", "/.well-known/olip.json"); if (r.status === 404) return { status: "skip", detail: "no OLIP 1.0 manifest at this address" };
    must((r.body.extensions_supported || []).includes("olip.ai/lifecycle-capabilities/2.0-draft"), "extension missing"); must(!(r.body.supported_versions || []).some((v) => v.startsWith("2")), "1.0 manifest must not claim a 2.x version");
  });
  await check("C-04", "Production hosts expose no mock hooks", async () => {
    if (caps.implementation.mode !== "production") { const r = await anon.request("GET", "/mock/v2/outbox"); return { status: "mock_only", detail: `test build (mock hooks ${r.status === 200 ? "present" : "absent"}); re-run against the production build` }; }
    const r = await anon.request("GET", "/mock/v2/outbox"); must(r.status === 404, `mock outbox reachable: ${r.status}`);
  });
  await check("C-05", "Recipient list is alphabetical and states that payment never affects order", async () => {
    const r = await anon.request("GET", "/olip/v2/recipients"); must(r.body.ordering?.paid_influence === false, "paid_influence");
    const names = r.body.recipients.map((x) => x.display_name); must(JSON.stringify(names) === JSON.stringify([...names].sort((a, b) => a.localeCompare(b))), "not alphabetical");
  });
  await check("C-06", "Host keys are Ed25519 JWKs with a purpose", async () => { const r = await anon.request("GET", "/olip/v2/keys"); must(r.body.keys.length && r.body.keys.every((k) => k.kty === "OKP" && k.crv === "Ed25519" && k.olip_key_purpose), "bad key set"); });
  await check("C-07", "Unauthenticated writes are refused with an OLIP error", async () => { const r = await anon.request("POST", "/olip/v2/matters", { casebrief: {} }); must(r.status === 401 && r.body.error?.code === "OLIP_UNAUTHENTICATED", `${r.status} ${r.body?.error?.code}`); });
  await check("C-08", "Unknown operations return 404 with an OLIP error", async () => { const r = await anon.request("GET", "/olip/v2/no-such-thing"); must(r.status === 404 && r.body.error?.code, `${r.status}`); });
  await check("C-09", "Responses carry no-store and nosniff headers", async () => { const r = await fetch(base + "/olip/v2/capabilities"); must(r.headers.get("cache-control") === "no-store" && r.headers.get("x-content-type-options") === "nosniff", "headers"); });

  // ---- behavior checks that need fictional test accounts and the mock inbox ----
  const user = new OlipLifecycleClient(base, { fetch: fetchChecked }), ai = new OlipLifecycleClient(base, { fetch: fetchChecked });
  let ready = false, m = null, req = null;
  await check("B-01", "User signs in and delegates an assistant; the assistant gets its own token", async () => {
    await user.negotiate(); await ai.negotiate();
    await user.userSession(profile.user.subject_id, profile.user.password);
    const d = await user.delegateAgent(profile.agent.client_id, true); await ai.agentToken(profile.agent.client_id, profile.agent.client_secret, d.delegation_code); ready = true;
  });
  const needReady = (fn) => async () => (ready ? fn() : { status: "skip", detail: "an earlier step (B-01 or B-02) did not complete, so this was not run" });
  await check("B-02", "Assistant can prepare a minimal screening; the response never includes the approval code", needReady(async () => {
    try { m = (await ai.createMatter(profile.casebrief, { fictional: true })).matter; }
    catch (e) { if (e.code === "OLIP_POLICY_GATE_CLOSED") { ready = false; return { status: "skip", detail: "the host's policy gate is closed for this jurisdiction (fails closed, as required until counsel approves rules); behavior checks skipped" }; } throw e; }
    req = await ai.requestConflictScreen(m.matter_id, profile.organization_id, profile.screening_fields);
    must(req.approval.state === "pending_user_approval", "state"); must(!/otp|"code"/i.test(JSON.stringify(req)), "approval code leaked to the assistant");
  }));
  await check("B-03", "The assistant cannot approve (403 OLIP_AGENT_CANNOT_APPROVE) and cannot read the approval page", needReady(async () => {
    const r = await ai.request("POST", `/olip/v2/approvals/${req.approval.approval_id}/decision`, { decision: "approve", otp: "000000", grant_digest: req.approval.grant_digest });
    must(r.status === 403 && r.body.error.code === "OLIP_AGENT_CANNOT_APPROVE", `${r.status} ${r.body?.error?.code}`);
    const g = await ai.request("GET", `/olip/v2/approvals/${req.approval.approval_id}`); must(g.status === 403 || g.status === 404, `approval page visible to agent: ${g.status}`);
  }));
  await check("B-04", "Nothing is sent before the user approves", needReady(async () => { const r = await ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/submit`, { grant_id: req.approval.grant_id, grant_digest: req.approval.grant_digest }); must(r.status === 403 && r.body.error.code === "OLIP_DISCLOSURE_NOT_AUTHORIZED", `${r.status}`); }));
  let sent = null;
  await check("B-05", "After the user approves on the page, the screening is delivered only with the firm's signed receipt", needReady(async () => {
    if (!mock) return { status: "skip", detail: "needs the user's code; this host has no mock inbox (run the human approval step by hand)" };
    const ob = await anon.request("GET", `/mock/v2/outbox`); const code = ob.body.messages.filter((x) => x.approval_id === req.approval.approval_id).at(-1).code;
    const page = await user.getApproval(req.approval.approval_id); must(page.approval.grant_digest === req.approval.grant_digest, "page digest differs");
    must(page.approval.preview.recipient.organization_id === profile.organization_id, "page names a different recipient");
    await user.decide(req.approval.approval_id, "approve", code, req.approval.grant_digest);
    sent = await ai.submitConflictScreen(req.conflict_screen.id, req.approval);
    must(sent.delivery.state === "delivered_to_endpoint" ? !!sent.delivery.receipt?.signature : sent.delivery.state === "accepted_by_transport", `state ${sent.delivery.state}`);
    return { status: "mock_only", detail: `delivery=${sent.delivery.state} (approval code read from the mock inbox)` };
  }));
  await check("B-06", "A used approval cannot be reused (410 OLIP_AUTHORIZATION_EXPIRED)", needReady(async () => {
    if (!sent) return { status: "skip", detail: "B-05 did not run" };
    const r = await ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/submit`, { grant_id: req.approval.grant_id, grant_digest: req.approval.grant_digest }); must([409, 410].includes(r.status), `${r.status}`);
  }));
  await check("B-07", "Mutations without Idempotency-Key are refused", needReady(async () => { const r = await ai.request("POST", "/olip/v2/matters", { casebrief: profile.casebrief, fictional: true }, { "idempotency-key": "" }); must(r.status === 400 && r.body.error.code === "OLIP_IDEMPOTENCY_KEY_REQUIRED", `${r.status} ${r.body?.error?.code}`); }));
  await check("B-08", "The assistant cannot record a firm's lifecycle event", needReady(async () => { const r = await ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/events`, { event: { olip_version: "2.0-draft", event_type: "intake.eligible_for_further_intake" } }); must(r.status === 403, `${r.status}`); }));
  await check("B-09", "The matter journal is hash-chained and host attestations verify", needReady(async () => {
    const ev = (await ai.events(m.matter_id)).entries; const keys = await ai.hostKeys(); let prev = "sha256:" + "0".repeat(64);
    const { digestOf } = await import("../sdk/typescript/dist/index.js");
    for (const e of ev) { must(e.prev_hash === prev, `broken link at ${e.seq}`); must((await digestOf({ seq: e.seq, recorded_at: e.recorded_at, prev_hash: e.prev_hash, event: e.event })) === e.entry_hash, `hash at ${e.seq}`); prev = e.entry_hash;
      if (e.event.actor.role !== "firm") must((await verifyDetached(e.event, keys)).ok, `host signature at ${e.seq}`); }
  }));
  await check("B-10", "Passport export is signed, transmits nothing and authorizes nobody", needReady(async () => { const p = (await user.exportPassport(m.matter_id)).passport; must(p.transmitted === false && p.authorizes_recipients.length === 0, "passport claims"); must((await verifyDetached(p, await user.hostKeys())).ok, "signature"); }));
  await check("S-01", "Every response seen in this run matches the published JSON Schemas", async () => { must(checker.problems.length === 0, JSON.stringify(checker.problems.slice(0, 3))); return { detail: `${checker.seen.size} operations checked` }; });
  return finish();

  function finish() {
    const count = (s) => results.filter((r) => r.status === s).length;
    return { olip_version: "2.0-draft", runner: "olip-2.0-draft-conformance/1", target: label, base, generated_for: "fictional test data only",
      independent_implementation: !!independent, implementation: caps?.implementation ?? null,
      statement: independent ? "Operator states this host was built without the OLIP reference code." : "Not an independent implementation result (reference code or unstated).",
      summary: { pass: count("pass"), fail: count("fail"), skip: count("skip"), mock_only: count("mock_only"), total: results.length }, results };
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const base = arg("--base");
  const out = [];
  if (base) out.push(await runConformance({ base, profile: arg("--profile") ? JSON.parse(readFileSync(arg("--profile"), "utf8")) : DEFAULT_PROFILE, label: arg("--label") || base, independent: process.argv.includes("--independent") }));
  else {
    const { startSystem } = await import("../reference/system.mjs");
    const { startCompatHost } = await import("../reference/compat-host.mjs");
    for (const topology of ["relay", "direct"]) {
      const sys = await startSystem({ topology, orgs: topology === "direct" ? ["org_test_alvarez"] : undefined });
      out.push(await runConformance({ base: sys.hostBase, label: `reference-${topology}` }));
      await sys.stop();
    }
    const sys = await startSystem(); const compat = await startCompatHost(sys); // OLIP 1.0 and 2.0-draft at one address
    out.push(await runConformance({ base: compat.base, label: "reference-compat-1.0-and-2.0" }));
    await compat.stop(); await sys.stop();
    const prod = await startSystem({ mode: "production" }); // production build: no mock hooks, policy gate fails closed
    out.push(await runConformance({ base: prod.hostBase, label: "reference-production-build" }));
    await prod.stop();
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
