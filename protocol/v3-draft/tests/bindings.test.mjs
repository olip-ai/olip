// The same action gives the same decision through every binding: the REST route, the generic HTTPS invoke, MCP and A2A.
// No binding has logic of its own that could skip the policy gateway.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ClientFactory } from "@a2a-js/sdk/client";
import { Role } from "@a2a-js/sdk";
import { createAgentMcpServer } from "../adapters/mcp/server.mjs";
import { startAgentA2A, OLIP_A2A_EXTENSION } from "../adapters/a2a/agent.mjs";
import { startSystem, people, raw, casebrief, SCREEN_FIELDS } from "./helpers.mjs";

let sys, who, mcp, a2aSrv, a2a, morganWf;
before(async () => {
  sys = await startSystem(); who = await people(sys);
  const { server } = createAgentMcpServer({ client: who.alpha, publicBase: sys.base });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  mcp = new Client({ name: "binding-test", version: "1.0.0" }); await server.connect(st); await mcp.connect(ct);
  a2aSrv = await startAgentA2A({ client: who.alpha, publicBase: sys.base }); a2a = await new ClientFactory().createFromUrl(a2aSrv.base);
  morganWf = (await (await people(sys, { subject: "usr_test_morgan" })).alpha.startWorkflow(casebrief())).workflow;
});
after(async () => { await mcp.close(); await a2aSrv.stop(); await sys.stop(); });

const key = () => `bind-${randomUUID()}`;
const viaRest = async (method, path, body) => (await raw(sys, method, path, { token: who.alpha.token, body, headers: { "idempotency-key": key() } })).body;
const viaInvoke = async (id, input) => (await raw(sys, "POST", `/olip/v3/actions/${id}/invoke`, { token: who.alpha.token, body: input, headers: { "idempotency-key": key() } })).body;
const viaMcp = async (id, input) => { const r = await mcp.callTool({ name: id.replace(/\./g, "_"), arguments: input }); return r.structuredContent?.result ?? r.structuredContent; };
const viaA2a = async (id, input) => {
  const r = await a2a.sendMessage({ tenant: "", configuration: undefined, metadata: undefined, message: { messageId: randomUUID(), contextId: "", taskId: "", role: Role.ROLE_USER, parts: [{ content: { $case: "data", value: { olip_action: id, arguments: input } }, metadata: undefined, filename: "", mediaType: "application/json" }], metadata: undefined, extensions: [OLIP_A2A_EXTENSION], referenceTaskIds: [] } }, { serviceParameters: { "A2A-Extensions": OLIP_A2A_EXTENSION } });
  const t = r.task ?? r.payload?.value ?? r;
  return t.artifacts?.[0]?.parts?.[0]?.content?.value ?? t.status.message.parts.map((p) => p.content).find((c) => c.$case === "data")?.value;
};
const codeOf = (b) => b?.error?.code ?? "no_error";

test("send before approval: USER_APPROVAL_REQUIRED through all four paths, and nothing is sent", async () => {
  const wf = (await who.alpha.startWorkflow(casebrief())).workflow;
  const d = (await who.alpha.previewDisclosure(wf.workflow_id, "org_test_alvarez", "screening", SCREEN_FIELDS)).disclosure;
  const input = { disclosure_id: d.disclosure_id, grant_id: d.approval.grant_id, grant_digest: d.approval.grant_digest };
  const codes = [codeOf(await viaRest("POST", "/olip/v3/disclosures/submit", input)), codeOf(await viaInvoke("olip.submit_approved_disclosure", input)), codeOf(await viaMcp("olip.submit_approved_disclosure", input)), codeOf(await viaA2a("olip.submit_approved_disclosure", input))];
  assert.deepEqual(codes, Array(4).fill("USER_APPROVAL_REQUIRED"));
  assert.equal([...sys.v2.host.state.objects.values()].filter((o) => o.type === "disclosure" && o.matter_id === wf.matter_id).length, 0);
});
test("another user's workflow: NOT_FOUND through all four paths", async () => {
  const id = morganWf.workflow_id;
  assert.deepEqual([codeOf(await viaRest("GET", `/olip/v3/workflows/${id}`)), codeOf(await viaInvoke("olip.get_workflow", { workflow_id: id })), codeOf(await viaMcp("olip.get_workflow", { workflow_id: id })), codeOf(await viaA2a("olip.get_workflow", { workflow_id: id }))], Array(4).fill("NOT_FOUND"));
});
test("invalid input: SCHEMA_INVALID through all four paths", async () => {
  const bad = { workflow_id: "wf_x", approve: true };
  assert.deepEqual([codeOf(await viaInvoke("olip.get_workflow", bad)), codeOf(await viaMcp("olip.get_workflow", bad)), codeOf(await viaA2a("olip.get_workflow", bad))], Array(3).fill("SCHEMA_INVALID"));
  assert.equal(codeOf(await viaRest("POST", "/olip/v3/workflows", { casebrief: casebrief(), approve: true })), "SCHEMA_INVALID");
});
test("same read, same answer: the manifest etag and the planner digest match across bindings", async () => {
  const etags = [(await viaRest("GET", "/olip/v3/agent-manifest")).etag, (await viaInvoke("olip.get_capabilities", {})).etag, (await viaMcp("olip.get_capabilities", {})).etag, (await viaA2a("olip.get_capabilities", {})).etag];
  assert.equal(new Set(etags).size, 1);
  const wf = (await who.alpha.startWorkflow(casebrief())).workflow;
  const input = { workflow_id: wf.workflow_id, desired_goal: "find_counsel" };
  const digests = [(await viaRest("POST", "/olip/v3/actions/plan-next", input)).plan_digest, (await viaInvoke("olip.plan_next_actions", input)).plan_digest, (await viaMcp("olip.plan_next_actions", input)).plan_digest, (await viaA2a("olip.plan_next_actions", input)).plan_digest];
  assert.equal(new Set(digests).size, 1);
});
