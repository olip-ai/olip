// The A2A adapter, exercised with the official A2A JavaScript SDK client (ClientFactory, JSON-RPC binding, A2A 1.0).
// Approval-gated steps go to AUTH_REQUIRED with the user's approval page; only the user's real approval completes them.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ClientFactory } from "@a2a-js/sdk/client";
import { TaskState, Role, A2A_PROTOCOL_VERSION } from "@a2a-js/sdk";
import { startAgentA2A, OLIP_A2A_EXTENSION, A2A_ACTIONS } from "../adapters/a2a/agent.mjs";
import { FORBIDDEN_NAME_PATTERNS } from "../reference/actions.mjs";
import { startSystem, people, approve, casebrief, SCREEN_FIELDS } from "./helpers.mjs";

let sys, who, srv, client;
before(async () => { sys = await startSystem(); who = await people(sys); srv = await startAgentA2A({ client: who.alpha, publicBase: sys.base }); client = await new ClientFactory().createFromUrl(srv.base); });
after(async () => { await srv.stop(); await sys.stop(); });
const send = (olip_action, args = {}, taskId = "") => client.sendMessage({ tenant: "", configuration: undefined, metadata: undefined,
  message: { messageId: randomUUID(), contextId: "", taskId, role: Role.ROLE_USER, parts: [{ content: { $case: "data", value: { olip_action, arguments: args } }, metadata: undefined, filename: "", mediaType: "application/json" }], metadata: undefined, extensions: [OLIP_A2A_EXTENSION], referenceTaskIds: [] } },
  { serviceParameters: { "A2A-Extensions": OLIP_A2A_EXTENSION } });
const asTask = (r) => r.task ?? r.payload?.value ?? r;
const art = (t) => t.artifacts?.[0]?.parts?.[0]?.content?.value;
const parts = (t) => t.status.message.parts.map((p) => p.content);

test("agent card: A2A 1.0 JSON-RPC, required OLIP extension, skills from the catalog, nothing that approves", async () => {
  const card = await (await fetch(`${srv.base}/.well-known/agent-card.json`)).json();
  assert.equal(A2A_PROTOCOL_VERSION, "1.0");
  assert.equal(card.supportedInterfaces[0].protocolBinding, "JSONRPC");
  assert.equal(card.capabilities.extensions[0].uri, OLIP_A2A_EXTENSION); assert.equal(card.capabilities.extensions[0].required, true);
  assert.deepEqual(card.skills.map((s) => s.id), A2A_ACTIONS.map((a) => a.id));
  for (const s of card.skills) assert.ok(!FORBIDDEN_NAME_PATTERNS.some((re) => re.test(s.id)), s.id);
  for (const id of ["olip.export_context_capsule", "olip.record_firm_event", "olip.set_jurisdiction_policy", "olip.subscribe_events"]) assert.ok(!card.skills.some((s) => s.id === id), id);
});
test("read actions complete with the OLIP response as an artifact that says completion is not a legal outcome", async () => {
  const t = asTask(await send("olip.find_professionals", { jurisdiction: "US-CA" }));
  assert.equal(t.status.state, TaskState.TASK_STATE_COMPLETED);
  assert.equal(art(t).ordering.paid_influence, false);
  assert.match(t.artifacts[0].metadata.olip_note, /not a legal outcome/);
});
test("disclosure: AUTH_REQUIRED with the approval page; submit before the user approves stays AUTH_REQUIRED; after approval it completes once", async () => {
  const wf = art(asTask(await send("olip.start_workflow", { casebrief: casebrief(), fictional: true }))).workflow;
  const t1 = asTask(await send("olip.preview_disclosure", { workflow_id: wf.workflow_id, organization_id: "org_test_alvarez", stage: "screening", fields: SCREEN_FIELDS }));
  assert.equal(t1.status.state, TaskState.TASK_STATE_AUTH_REQUIRED);
  const page = parts(t1).find((c) => c.$case === "url").value;
  const prepared = parts(t1).find((c) => c.$case === "data").value.prepared;
  assert.equal(new URL(page).pathname, prepared.disclosure.approval.approval_url);
  const t2 = asTask(await send("submit", {}, t1.id));
  assert.equal(t2.status.state, TaskState.TASK_STATE_AUTH_REQUIRED);
  assert.equal(parts(t2).find((c) => c.$case === "data").value.error.code, "USER_APPROVAL_REQUIRED");
  await approve(sys, who, prepared.disclosure.approval);
  const t3 = asTask(await send("submit", {}, t1.id));
  assert.equal(t3.status.state, TaskState.TASK_STATE_COMPLETED);
  assert.equal(art(t3).delivery.state, "delivered_to_endpoint");
  assert.equal([...sys.v2.host.state.objects.values()].filter((o) => o.type === "disclosure" && o.matter_id === wf.matter_id).length, 1);
  await assert.rejects(send("submit", {}, t1.id), /terminal state/, "the completed task cannot be reused to send again");
});
test("unknown or not-allowed actions are rejected; OLIP errors map to task states with the stable code", async () => {
  const t = asTask(await send("olip.approve_disclosure", {}));
  assert.equal(t.status.state, TaskState.TASK_STATE_REJECTED);
  assert.equal(parts(t)[0].value.error.code, "ACTION_NOT_SUPPORTED");
  const f = asTask(await send("olip.record_firm_event", { object_type: "matter", object_id: "x", event: {} }));
  assert.equal(f.status.state, TaskState.TASK_STATE_REJECTED);
  const nf = asTask(await send("olip.get_workflow", { workflow_id: "wf_missing" }));
  assert.equal(parts(nf)[0].value.error.code, "NOT_FOUND");
});
