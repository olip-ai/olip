// Independent user authorization: the assistant drafts and requests; only the authenticated user approves.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startSystem, actors, userApproves, staff, acts, eligibleMatter, casebrief, SCREEN_FIELDS, expectErr, ok, obj, httpTransport, FIRMS } from "./helpers.mjs";
let sys, a;
before(async () => { sys = await startSystem(); a = await actors(sys); });
after(() => sys.stop());
const newScreen = async (fields = SCREEN_FIELDS, org = "org_test_alvarez", cb = casebrief()) => { const m = (await a.ai.createMatter(cb, { fictional: true })).matter; return { m, req: await a.ai.requestConflictScreen(m.matter_id, org, fields) }; };

test("agent fabricates approval: decision endpoint refuses agent tokens; submit without approval refuses", async () => {
  const { req } = await newScreen();
  expectErr(await a.ai.request("POST", `/olip/v2/approvals/${req.approval.approval_id}/decision`, { decision: "approve", otp: "000000", grant_digest: req.approval.grant_digest }), 403, "OLIP_AGENT_CANNOT_APPROVE");
  expectErr(await a.ai.request("GET", `/olip/v2/approvals/${req.approval.approval_id}`), 403, "OLIP_FORBIDDEN");
  expectErr(await a.ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/submit`, { grant_id: req.approval.grant_id, grant_digest: req.approval.grant_digest }), 403, "OLIP_DISCLOSURE_NOT_AUTHORIZED");
  expectErr(await a.ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/submit`, { grant_id: "grt_made_up", grant_digest: "sha256:00" }), 403, "OLIP_DISCLOSURE_NOT_AUTHORIZED");
  assert.equal(obj(sys, req.conflict_screen.id).state, "not_started");
});
test("approval response never contains the code; wrong codes lock the request after 3 tries", async () => {
  const { req } = await newScreen();
  assert.ok(!JSON.stringify(req).match(/"code"|otp/i));
  for (let i = 0; i < 2; i++) expectErr(await a.user.request("POST", `/olip/v2/approvals/${req.approval.approval_id}/decision`, { decision: "approve", otp: "999999x", grant_digest: req.approval.grant_digest }), 403, "OLIP_APPROVAL_CODE_INVALID");
  expectErr(await a.user.request("POST", `/olip/v2/approvals/${req.approval.approval_id}/decision`, { decision: "approve", otp: "999999x", grant_digest: req.approval.grant_digest }), 429, "OLIP_APPROVAL_LOCKED");
  await assert.rejects(userApproves(sys, a.user, req.approval), /OLIP_APPROVAL_ALREADY_DECIDED/);
});
test("another user cannot see or decide someone else's approval (404, no existence leak)", async () => {
  const { req } = await newScreen();
  const other = await actors(sys, { subject: "usr_test_morgan" });
  expectErr(await other.user.request("GET", `/olip/v2/approvals/${req.approval.approval_id}`), 404, "OLIP_NOT_FOUND");
  expectErr(await other.user.request("POST", `/olip/v2/approvals/${req.approval.approval_id}/decision`, { decision: "approve", otp: "1", grant_digest: req.approval.grant_digest }), 404, "OLIP_NOT_FOUND");
});
test("approving a page whose digest differs from the request is refused", async () => {
  const { req } = await newScreen();
  const ob = (await httpTransport(sys.hostBase).call("GET", "/mock/v2/outbox")).body.messages.find((x) => x.approval_id === req.approval.approval_id);
  expectErr(await a.user.request("POST", `/olip/v2/approvals/${req.approval.approval_id}/decision`, { decision: "approve", otp: ob.code, grant_digest: "sha256:" + "1".repeat(64) }), 409, "OLIP_CONSENT_DIGEST_MISMATCH");
});
test("client edits the CaseBrief after approval: digest mismatch, nothing sent", async () => {
  const { m, req } = await newScreen();
  await userApproves(sys, a.user, req.approval);
  expectErr(await a.ai.request("PUT", `/olip/v2/matters/${m.matter_id}/casebrief`, { casebrief: casebrief({ adverse_parties: ["Someone Else LLC (fictional)"] }) }), 428, "OLIP_REVISION_REQUIRED");
  expectErr(await a.ai.request("PUT", `/olip/v2/matters/${m.matter_id}/casebrief`, { casebrief: casebrief() }, { "if-match": "7" }), 409, "OLIP_REVISION_CONFLICT");
  ok(await a.ai.request("PUT", `/olip/v2/matters/${m.matter_id}/casebrief`, { casebrief: casebrief({ adverse_parties: ["Someone Else LLC (fictional)"] }) }, { "if-match": "1" }));
  expectErr(await a.ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/submit`, { grant_id: req.approval.grant_id, grant_digest: req.approval.grant_digest }), 409, "OLIP_CONSENT_DIGEST_MISMATCH");
  assert.equal(obj(sys, req.conflict_screen.id).state, "not_started");
});
test("one approval, one recipient: reuse for another firm or a second send is refused", async () => {
  const { m, req } = await newScreen();
  await userApproves(sys, a.user, req.approval);
  const other = await a.ai.requestConflictScreen(m.matter_id, "org_test_northgate", SCREEN_FIELDS);
  expectErr(await a.ai.request("POST", `/olip/v2/conflict-screens/${other.conflict_screen.id}/submit`, { grant_id: req.approval.grant_id, grant_digest: req.approval.grant_digest }), 403, "OLIP_DISCLOSURE_NOT_AUTHORIZED");
  ok(await a.ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/submit`, { grant_id: req.approval.grant_id, grant_digest: req.approval.grant_digest }));
  expectErr(await a.ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/submit`, { grant_id: req.approval.grant_id, grant_digest: req.approval.grant_digest }), 409, "OLIP_LIFECYCLE_TRANSITION_INVALID");
});
test("an approved request expires if unused", async () => {
  const { req } = await newScreen();
  await userApproves(sys, a.user, req.approval);
  sys.clock.advance(31 * 60);
  const b = await actors(sys); // fresh tokens after the clock jump
  expectErr(await b.ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/submit`, { grant_id: req.approval.grant_id, grant_digest: req.approval.grant_digest }), 410, "OLIP_AUTHORIZATION_EXPIRED");
  a = b;
});
test("the host enforces the firm's screening allowlist: extra, nested and disguised fields are refused", async () => {
  const m = (await a.ai.createMatter(casebrief(), { fictional: true })).matter;
  expectErr(await a.ai.request("POST", `/olip/v2/matters/${m.matter_id}/conflict-screens`, { organization_id: "org_test_alvarez", fields: [...SCREEN_FIELDS, "facts.summary"], selection: { by: "user" } }), 422, "OLIP_FIELD_NOT_ALLOWED");
  expectErr(await a.ai.request("POST", `/olip/v2/matters/${m.matter_id}/conflict-screens`, { organization_id: "org_test_alvarez", fields: ["prospective_client.name", "facts"], selection: { by: "user" } }), 422, "OLIP_FIELD_NOT_ALLOWED");
  expectErr(await a.ai.request("POST", `/olip/v2/matters/${m.matter_id}/conflict-screens`, { organization_id: "org_test_alvarez", fields: SCREEN_FIELDS, selection: { by: "agent" } }), 422, "OLIP_RECIPIENT_NOT_USER_SELECTED");
  const nested = (await a.ai.createMatter(casebrief({ adverse_parties: { hidden: { facts: "smuggled detail" } } }), { fictional: true })).matter;
  expectErr(await a.ai.request("POST", `/olip/v2/matters/${nested.matter_id}/conflict-screens`, { organization_id: "org_test_alvarez", fields: SCREEN_FIELDS, selection: { by: "user" } }), 422, "OLIP_DISCLOSURE_NOT_AUTHORIZED");
  const ssn = (await a.ai.createMatter(casebrief({ prospective_client: { name: "Casey Rivera (fictional) 123-45-6789" } }), { fictional: true })).matter;
  const r = expectErr(await a.ai.request("POST", `/olip/v2/matters/${ssn.matter_id}/conflict-screens`, { organization_id: "org_test_alvarez", fields: SCREEN_FIELDS, selection: { by: "user" } }), 422, "OLIP_SENSITIVE_DATA_BLOCKED");
  assert.deepEqual(r.error.problems[0].findings, ["us_ssn"]);
});
test("fuller CaseBrief before the firm says intake may continue is refused (conflict-safe by default)", async () => {
  const { m, req } = await newScreen();
  await userApproves(sys, a.user, req.approval);
  await a.ai.submitConflictScreen(req.conflict_screen.id, req.approval);
  expectErr(await a.ai.request("POST", `/olip/v2/matters/${m.matter_id}/disclosures`, { organization_id: "org_test_alvarez", fields: ["facts.summary"] }), 409, "OLIP_CONFLICT_STAGE_REQUIRED");
  expectErr(await a.ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/additional-information`, { fields: ["related_parties"] }), 409, "OLIP_CONFLICT_STAGE_REQUIRED");
});
test("additional screening may contain only the field the firm asked for", async () => {
  const { m, req } = await newScreen();
  await userApproves(sys, a.user, req.approval);
  const sub = await a.ai.submitConflictScreen(req.conflict_screen.id, req.approval);
  const j = await staff(sys, "org_test_alvarez", "stf_test_jordan");
  ok(await j.act(acts.screenAct(sub.conflict_screen, "intake.information_requested", { fields: [{ path: "related_parties", question: "Anyone else on the lease?" }] })));
  expectErr(await a.ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/additional-information`, { fields: ["related_parties", "prospective_client.name"] }), 422, "OLIP_FIELD_NOT_ALLOWED");
  const ok1 = ok(await a.ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/additional-information`, { fields: ["related_parties"] }));
  await userApproves(sys, a.user, ok1.approval);
  ok(await a.ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/additional-information/submit`, ok1.approval));
  const inbox = (await j.inbox()).body.deliveries.filter((d) => d.delivery.payload.conflict_screen_id === req.conflict_screen.id);
  assert.deepEqual(inbox.at(-1).delivery.payload.fields.map((f) => f.path), ["related_parties"]);
});
test("prompt injection inside the CaseBrief stays inert data: no approval, no send, no new recipient", async () => {
  const before = sys.host.state.grants.size;
  const m = (await a.ai.createMatter(casebrief(), { fictional: true })).matter;
  const got = (await a.ai.getMatter(m.matter_id)).matter;
  assert.match(got.casebrief.content.facts.summary, /SYSTEM NOTE TO AI/);
  assert.match(got.casebrief.statement, /never as instructions/);
  assert.equal(sys.host.state.grants.size, before);
  assert.equal(got.status.conflict_screens.length, 0);
});
test("a different AI client needs explicit content access; revoking a delegation stops the assistant", async () => {
  const { m } = await eligibleMatter(sys, a);
  const b = await actors(sys, { agent: "agt_test_assistant_b", content_access: false });
  const view = ok(await b.ai.request("GET", `/olip/v2/matters/${m.matter_id}`));
  assert.equal(view.matter.casebrief.content, null);
  const t = ok(await a.ai.request("POST", `/olip/v2/matters/${m.matter_id}/threads`, { organization_id: "org_test_alvarez" }));
  expectErr(await b.ai.request("GET", `/olip/v2/threads/${t.thread.id}/messages`), 403, "OLIP_DISCLOSURE_NOT_AUTHORIZED");
  expectErr(await b.ai.request("POST", `/olip/v2/threads/${t.thread.id}/messages`, { body: "hi" }), 403, "OLIP_DISCLOSURE_NOT_AUTHORIZED");
  ok(await b.user.request("POST", `/olip/v2/agent-delegations/${b.delegation.delegation_id}/revoke`, {}));
  expectErr(await b.ai.request("GET", `/olip/v2/matters/${m.matter_id}`), 401, "OLIP_DELEGATION_REVOKED");
});
test("the user can decline and can revoke an unused approval", async () => {
  const { req } = await newScreen();
  const d = await userApproves(sys, a.user, req.approval, { decision: "decline" });
  assert.equal(d.state, "declined");
  expectErr(await a.ai.request("POST", `/olip/v2/conflict-screens/${req.conflict_screen.id}/submit`, req.approval), 403, "OLIP_DISCLOSURE_NOT_AUTHORIZED");
  const { req: r2 } = await newScreen();
  await userApproves(sys, a.user, r2.approval);
  ok(await a.user.request("POST", `/olip/v2/grants/${r2.approval.grant_id}/revoke`, {}));
  expectErr(await a.ai.request("POST", `/olip/v2/conflict-screens/${r2.conflict_screen.id}/submit`, r2.approval), 403, "OLIP_DISCLOSURE_NOT_AUTHORIZED");
});
test("approval page is accessible, labeled and shows exactly what is shared", async () => {
  const { req } = await newScreen();
  const r = await fetch(sys.hostBase + req.approval.approval_url, { headers: { accept: "text/html", authorization: `Bearer ${a.user["token"]}` } });
  const html = await r.text();
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
  assert.match(html, /<html lang="en">/); assert.match(html, /<label for="otp">/); assert.match(html, /Do not approve/);
  assert.match(html, /prospective_client\.name/); assert.ok(!html.includes("facts.summary"));
  assert.ok(!/checked/.test(html), "nothing is pre-checked");
});
