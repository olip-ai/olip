// The MCP adapter, exercised with the official MCP SDK Client over the SDK's in-memory transport.
// No tool approves, confirms or acts for a firm; URL elicitation only opens the user's approval page; the assistant
// cannot complete a disclosure until the USER approves there; retries of the same call never send twice.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema, LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { createAgentMcpServer, MCP_ACTIONS, toolName } from "../adapters/mcp/server.mjs";
import { ACTIONS, FORBIDDEN_NAME_PATTERNS } from "../reference/actions.mjs";
import { startSystem, people, approve, casebrief, SCREEN_FIELDS } from "./helpers.mjs";

let sys, who;
before(async () => { sys = await startSystem(); who = await people(sys); });
after(() => sys.stop());
async function connect({ url = true, onElicit } = {}) {
  const { server } = createAgentMcpServer({ client: who.alpha, publicBase: sys.base });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-assistant-host", version: "1.0.0" }, { capabilities: url ? { elicitation: { url: {} } } : {} });
  const seen = [];
  if (url) client.setRequestHandler(ElicitRequestSchema, async (req) => { seen.push(req.params); return onElicit ? onElicit(req.params) : { action: "accept" }; });
  const completions = [];
  client.fallbackNotificationHandler = async (n) => { if (n.method === "notifications/elicitation/complete") completions.push(n.params.elicitationId); };
  await server.connect(st); await client.connect(ct);
  const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); return { isError: !!r.isError, body: r.structuredContent?.result ?? r.structuredContent }; };
  return { client, call, seen, completions };
}

test("protocol version comes from the pinned official SDK; the tool list is the assistant-safe subset of the action catalog", async () => {
  const c = await connect();
  assert.equal(LATEST_PROTOCOL_VERSION, "2025-11-25", "the pinned SDK's newest MCP revision; 2026-07-28 is not offered by it (documented gap)");
  assert.ok(!SUPPORTED_PROTOCOL_VERSIONS.includes("2026-07-28"));
  const { tools } = await c.client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), MCP_ACTIONS.map((a) => toolName(a.id)).sort());
  for (const t of tools) assert.ok(!FORBIDDEN_NAME_PATTERNS.some((re) => re.test(t.name)), t.name);
  for (const id of ["olip.export_context_capsule", "olip.authorize_capsule_import", "olip.revoke_context_capsule", "olip.record_firm_event", "olip.set_jurisdiction_policy"]) assert.ok(!tools.some((t) => t.name === toolName(id)), id);
  for (const t of tools) {
    const a = ACTIONS.find((x) => toolName(x.id) === t.name);
    assert.equal(t._meta["olip/effect"], a.effect);
    if (a.effect === "read_only" && !a.mutating) assert.equal(t.annotations.readOnlyHint, true, t.name);
    if (a.effect === "external_disclosure") { assert.equal(t.annotations.readOnlyHint, false); assert.equal(t.annotations.openWorldHint, true); assert.match(t.description, /approval page/); }
  }
  await assert.rejects(c.client.callTool({ name: "olip_approve_disclosure", arguments: {} }), /Unknown tool/);
  const res = await c.client.listResources();
  assert.deepEqual(res.resources.map((r) => r.uri).sort(), ["olip://agent-manifest", "olip://status-semantics"]);
  const man = JSON.parse((await c.client.readResource({ uri: "olip://agent-manifest" })).contents[0].text);
  assert.equal(man.release_status, "proposed_draft_not_adopted");
  await c.client.close();
});
test("prepare -> URL elicitation opens the approval page (not an approval) -> send refused until the user approves -> sent once", async () => {
  const c = await connect();
  const wf = (await c.call("olip_start_workflow", { casebrief: casebrief(), fictional: true })).body.workflow;
  const pv = await c.call("olip_preview_disclosure", { workflow_id: wf.workflow_id, organization_id: "org_test_alvarez", stage: "screening", fields: SCREEN_FIELDS });
  assert.equal(pv.isError, false);
  assert.equal(c.seen.length, 1); assert.equal(c.seen[0].mode, "url");
  assert.equal(new URL(c.seen[0].url).pathname, pv.body.disclosure.approval.approval_url);
  assert.match(pv.body.approval_page.statement, /NOT an approval/);
  const d = pv.body.disclosure;
  const args = { disclosure_id: d.disclosure_id, grant_id: d.approval.grant_id, grant_digest: d.approval.grant_digest };
  const early = await c.call("olip_submit_approved_disclosure", args);
  assert.equal(early.isError, true); assert.equal(early.body.error.code, "USER_APPROVAL_REQUIRED");
  await approve(sys, who, d.approval);
  const ok = await c.call("olip_submit_approved_disclosure", args); // errors are never cached, so the same call now succeeds
  assert.equal(ok.isError, false, JSON.stringify(ok.body));
  assert.equal(ok.body.delivery.state, "delivered_to_endpoint");
  assert.equal(ok.body.action_receipt.effect, "external_disclosure");
  const retry = await c.call("olip_submit_approved_disclosure", args);
  assert.equal(retry.body.idempotent_replay, true, "a retried tool call (same arguments, same session) replays instead of sending again");
  assert.equal([...sys.v2.host.state.objects.values()].filter((o) => o.type === "disclosure" && o.matter_id === wf.matter_id).length, 1);
  await c.client.close();
});
test("without URL elicitation the approval link is returned for the assistant to show; a declined elicitation sends nothing", async () => {
  const c = await connect({ url: false });
  const wf = (await c.call("olip_start_workflow", { casebrief: casebrief() })).body.workflow;
  const pv = await c.call("olip_preview_disclosure", { workflow_id: wf.workflow_id, organization_id: "org_test_cedar", stage: "screening", fields: SCREEN_FIELDS });
  assert.match(pv.body.approval_page.opened_via, /^not_opened/);
  await c.client.close();
  const d = await connect({ onElicit: () => ({ action: "decline" }) });
  const pv2 = await d.call("olip_preview_disclosure", { workflow_id: wf.workflow_id, organization_id: "org_test_northgate", stage: "screening", fields: SCREEN_FIELDS });
  assert.equal(pv2.body.approval_page.user_action, "decline"); assert.match(pv2.body.approval_page.statement, /Nothing will be sent/);
  await d.client.close();
});
test("errors keep their stable codes; schema violations and cross-tenant reads are tool errors, not crashes", async () => {
  const c = await connect();
  const bad = await c.call("olip_get_workflow", { workflow_id: "wf_nope", extra: 1 });
  assert.equal(bad.isError, true); assert.equal(bad.body.error.code, "SCHEMA_INVALID");
  const morgan = await people(sys, { subject: "usr_test_morgan" });
  const mwf = (await morgan.alpha.startWorkflow(casebrief())).workflow;
  const x = await c.call("olip_get_workflow", { workflow_id: mwf.workflow_id });
  assert.equal(x.body.error.code, "NOT_FOUND");
  const plan = await c.call("olip_plan_next_actions", { workflow_id: (await c.call("olip_start_workflow", { casebrief: casebrief() })).body.workflow.workflow_id });
  assert.equal(plan.body.not_authorization, true);
  await c.client.close();
});
