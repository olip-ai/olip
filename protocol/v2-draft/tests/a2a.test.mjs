// The A2A adapter, exercised with the official A2A JavaScript SDK client (ClientFactory, JSON-RPC binding, A2A 1.0).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ClientFactory } from "@a2a-js/sdk/client";
import { TaskState, Role, A2A_PROTOCOL_VERSION } from "@a2a-js/sdk";
import { startLifecycleA2A, OPERATIONS, OLIP_A2A_EXTENSION } from "../adapters/a2a/agent.mjs";
import { startSystem, actors, userApproves, CASEBRIEF, SCREEN_FIELDS } from "./helpers.mjs";

let sys, a, srv, client;
before(async () => { sys = await startSystem(); a = await actors(sys); srv = await startLifecycleA2A({ client: a.ai }); client = await new ClientFactory().createFromUrl(srv.base); });
after(async () => { await srv.stop(); await sys.stop(); });

const send = (op, args = {}, taskId = "") => client.sendMessage({ tenant: "", configuration: undefined, metadata: undefined,
  message: { messageId: randomUUID(), contextId: "", taskId, role: Role.ROLE_USER, parts: [{ content: { $case: "data", value: { olip_operation: op, arguments: args } }, metadata: undefined, filename: "", mediaType: "application/json" }], metadata: undefined, extensions: [OLIP_A2A_EXTENSION], referenceTaskIds: [] } },
  { serviceParameters: { "A2A-Extensions": OLIP_A2A_EXTENSION } }); // the agent card marks the OLIP extension as required
const asTask = (r) => r.task ?? r.payload?.value ?? r; // tolerate SDK result wrappers
const data = (t) => t.artifacts?.[0]?.parts?.[0]?.content?.value;
const statusParts = (t) => t.status.message.parts.map((p) => p.content);

test("agent card: A2A 1.0 JSON-RPC interface, OLIP extension declared, no approve or confirm operation", async () => {
  const card = await (await fetch(`${srv.base}/.well-known/agent-card.json`)).json();
  assert.equal(A2A_PROTOCOL_VERSION, "1.0");
  assert.equal(card.supportedInterfaces[0].protocolBinding, "JSONRPC"); assert.equal(card.supportedInterfaces[0].protocolVersion, "1.0");
  assert.equal(card.capabilities.extensions[0].uri, OLIP_A2A_EXTENSION);
  for (const op of OPERATIONS) assert.ok(!/approve|decide|confirm|accept/.test(op), op);
});
test("read operation completes with the OLIP response as an artifact", async () => {
  const t = asTask(await send("list_recipients", { jurisdiction: "US-CA" }));
  assert.equal(t.status.state, TaskState.TASK_STATE_COMPLETED);
  assert.equal(data(t).ordering.paid_influence, false);
});
test("approval-gated step: AUTH_REQUIRED with the approval page; submit before the user approves stays AUTH_REQUIRED; after the user approves it completes", async () => {
  const m = data(asTask(await send("create_matter", { casebrief: CASEBRIEF }))).matter;
  const t1 = asTask(await send("request_conflict_screen", { matter_id: m.matter_id, organization_id: "org_test_alvarez", fields: SCREEN_FIELDS }));
  assert.equal(t1.status.state, TaskState.TASK_STATE_AUTH_REQUIRED);
  const page = statusParts(t1).find((c) => c.$case === "url").value;
  const prepared = statusParts(t1).find((c) => c.$case === "data").value.prepared;
  assert.equal(new URL(page).pathname, prepared.approval.approval_url);
  const t2 = asTask(await send("submit", {}, t1.id));
  assert.equal(t2.status.state, TaskState.TASK_STATE_AUTH_REQUIRED, "not approved yet");
  assert.equal(statusParts(t2).find((c) => c.$case === "data").value.error.code, "OLIP_DISCLOSURE_NOT_AUTHORIZED");
  await userApproves(sys, a.user, prepared.approval);
  const t3 = asTask(await send("submit", {}, t1.id));
  assert.equal(t3.status.state, TaskState.TASK_STATE_COMPLETED);
  assert.equal(data(t3).delivery.state, "delivered_to_endpoint");
});
test("unknown or forbidden operations are rejected; OLIP errors keep their stable code", async () => {
  for (const op of ["approve", "firm_confirm_engagement", "decide_approval"]) {
    const t = asTask(await send(op, {}));
    assert.equal(t.status.state, TaskState.TASK_STATE_REJECTED, op);
  }
  const nf = asTask(await send("get_engagement", { engagement_id: "eng_doesnotexist000" }));
  assert.equal(nf.status.state, TaskState.TASK_STATE_FAILED);
  assert.equal(statusParts(nf)[0].value.error.code, "OLIP_NOT_FOUND");
});
test("a client that does not declare the required OLIP extension is refused by the SDK", async () => {
  await assert.rejects(client.sendMessage({ tenant: "", configuration: undefined, metadata: undefined, message: { messageId: randomUUID(), contextId: "", taskId: "", role: Role.ROLE_USER, parts: [{ content: { $case: "text", value: "hello" }, metadata: undefined, filename: "", mediaType: "text/plain" }], metadata: undefined, extensions: [], referenceTaskIds: [] } }), /required extensions/);
});
