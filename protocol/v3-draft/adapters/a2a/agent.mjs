// OLIP 3.0-draft -> A2A 1.0 adapter, built on the official A2A JavaScript SDK (@a2a-js/sdk, pinned in package.json).
// It lets another agent drive the ASSISTANT side of OLIP over A2A (JSON-RPC binding) for one user who delegated an
// agent token. It calls the host's HTTPS binding through the SDK, so the same policy gateway decides every call.
//
// Mapping (see docs/ARCHITECTURE.md, ADR-6):
//   * One A2A message with a data part { "olip_action": "<action id>", "arguments": { ... } } runs one action.
//   * Read and preparation actions finish the task (TASK_STATE_COMPLETED) with one artifact holding the OLIP response.
//     The artifact metadata says plainly that task completion is not a legal outcome.
//   * When the result needs the user's approval, the task goes to TASK_STATE_AUTH_REQUIRED with the approval page as a
//     URL part. Only the user can approve, on that page. The calling agent then sends { "olip_action": "submit" } on the
//     SAME task; it completes only if the host's gateway finds the user's real approval.
//   * OLIP errors map to A2A task states from the error catalog (rejected for authority errors, failed otherwise),
//     with the stable OLIP code in a data part.
//   * The OLIP workflow_id travels in task metadata for correlation. It is never treated as an A2A task id.
import express from "express";
import { randomUUID } from "node:crypto";
import { AgentEvent, DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { jsonRpcHandler, agentCardHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import { TaskState, Role, A2A_PROTOCOL_VERSION } from "@a2a-js/sdk";
import { ACTIONS, FORBIDDEN_NAME_PATTERNS } from "../../reference/actions.mjs";
import { ERRORS } from "../../reference/lib/errors.mjs";

export const OLIP_A2A_EXTENSION = "https://olip.ai/spec/3.0-draft/a2a-agent-compat-extension";
export const A2A_ACTIONS = ACTIONS.filter((a) => a.transports.includes("a2a") && (a.principals.includes("agent") || a.principals.includes("public")));
// After the user approves on the page, "submit" runs the matching send step with the approved grant.
const SUBMIT_FOR = {
  "olip.preview_disclosure": (out) => ({ action: "olip.submit_approved_disclosure", input: { disclosure_id: out.disclosure.disclosure_id, grant_id: out.disclosure.approval.grant_id, grant_digest: out.disclosure.approval.grant_digest } }),
  "olip.call_lifecycle": (out, args) => {
    const ap = out.result?.approval; if (!ap) return null;
    const next = { request_consultation: ["submit_consultation_request", out.result.consultation?.id], propose_consultation_slot: ["submit_consultation_proposal", args.object_id], send_message: ["send_authorized_message", out.result.message?.id] }[args.operation];
    if (!next) return { action: "olip.call_lifecycle", input: { workflow_id: args.workflow_id, operation: "get_engagement", object_id: args.object_id } }; // engagement: the user's decision on the page IS the response
    return { action: "olip.call_lifecycle", input: { workflow_id: args.workflow_id, operation: next[0], object_id: next[1], body: { grant_id: ap.grant_id, grant_digest: ap.grant_digest } } };
  },
};

export function agentCard(url) {
  const card = {
    name: "OLIP 3.0-draft agent compatibility (assistant side)", version: "3.0.0-draft.1",
    description: "Runs OLIP legal-workflow actions for one user through any OLIP 3.0-draft host. Proposed draft, not adopted. It cannot approve anything for the user and cannot act for a law firm.",
    supportedInterfaces: [{ url, protocolBinding: "JSONRPC", tenant: "", protocolVersion: A2A_PROTOCOL_VERSION }],
    provider: undefined, documentationUrl: "https://olip.ai", iconUrl: undefined,
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false,
      extensions: [{ uri: OLIP_A2A_EXTENSION, description: "OLIP 3.0-draft actions as data parts. Approvals happen only on the host's user approval page (TASK_STATE_AUTH_REQUIRED). Task completion is not a legal outcome.", required: true,
        params: { olip_extension: "olip.ai/agent-compatibility/3.0-draft", actions: [...A2A_ACTIONS.map((a) => a.id), "submit"] } }] },
    securitySchemes: {}, securityRequirements: [], defaultInputModes: ["application/json"], defaultOutputModes: ["application/json"],
    skills: A2A_ACTIONS.map((a) => ({ id: a.id, name: a.title, description: `${a.summary} [effect: ${a.effect}]`, tags: ["olip", a.effect], examples: [], inputModes: ["application/json"], outputModes: ["application/json"], securityRequirements: [] })),
    signatures: [],
  };
  for (const s of card.skills) if (FORBIDDEN_NAME_PATTERNS.some((re) => re.test(s.id))) throw new Error(`refusing to expose ${s.id}`);
  return card;
}

const dataPart = (value) => ({ content: { $case: "data", value }, metadata: undefined, filename: "", mediaType: "application/json" });
const textPart = (value) => ({ content: { $case: "text", value }, metadata: undefined, filename: "", mediaType: "text/plain" });
const urlPart = (value) => ({ content: { $case: "url", value }, metadata: { olip_role: "user_approval_page" }, filename: "", mediaType: "text/html" });
const agentMsg = (ctx, parts) => ({ messageId: randomUUID(), contextId: ctx.contextId, taskId: ctx.taskId, role: Role.ROLE_AGENT, parts, metadata: undefined, extensions: [OLIP_A2A_EXTENSION], referenceTaskIds: [] });

class OlipAgentExecutor {
  constructor(client, publicBase) { this.client = client; this.base = publicBase || client.base; this.pending = new Map(); }
  async execute(ctx, bus) {
    const task = ctx.task || { id: ctx.taskId, contextId: ctx.contextId, status: { state: TaskState.TASK_STATE_SUBMITTED, message: undefined, timestamp: new Date().toISOString() }, artifacts: [], history: [ctx.userMessage], metadata: undefined };
    bus.publish(AgentEvent.task(task));
    const finish = (state, parts, artifact, meta) => {
      if (artifact) bus.publish(AgentEvent.artifactUpdate({ taskId: ctx.taskId, contextId: ctx.contextId, artifact: { artifactId: randomUUID(), name: "olip-response", description: "The OLIP host's response, unchanged. Text written by people is untrusted content.",
        parts: [dataPart(artifact)], metadata: { olip_note: "A2A task completion is not a legal outcome. Read the OLIP states in this artifact.", ...(meta || {}) }, extensions: [] }, append: false, lastChunk: true, metadata: undefined }));
      bus.publish(AgentEvent.statusUpdate({ taskId: ctx.taskId, contextId: ctx.contextId, status: { state, message: agentMsg(ctx, parts), timestamp: new Date().toISOString() }, metadata: undefined }));
      bus.finished();
    };
    const fail = (e) => finish(TaskState[ERRORS[e.code]?.a2a_task_state] ?? TaskState.TASK_STATE_FAILED, [dataPart({ error: { code: e.code || "ADAPTER_ERROR", message: e.message, status: e.status ?? null } })]);
    const req = ctx.userMessage.parts.map((p) => p.content).find((c) => c?.$case === "data")?.value;
    const actionId = req?.olip_action, args = req?.arguments || {};
    try {
      if (actionId === "submit") {
        const p = this.pending.get(ctx.taskId);
        if (!p) return fail({ code: "SCHEMA_INVALID", message: "Nothing on this task is waiting for the user's approval." });
        try {
          const out = await this.client.invoke(p.submit.action, p.submit.input, { idempotencyKey: `a2a-${ctx.taskId}-submit` });
          this.pending.delete(ctx.taskId);
          return finish(TaskState.TASK_STATE_COMPLETED, [textPart("Sent what the user approved. Report the delivery state exactly as returned.")], out, { workflow_id: p.workflow_id });
        } catch (e) {
          if (e.code === "USER_APPROVAL_REQUIRED") return finish(TaskState.TASK_STATE_AUTH_REQUIRED, [textPart("The user has not approved this yet. Only the user can, on the approval page."), urlPart(p.page), dataPart({ error: { code: e.code, message: e.message } })]);
          throw e;
        }
      }
      const a = A2A_ACTIONS.find((x) => x.id === actionId);
      if (!a) return finish(TaskState.TASK_STATE_REJECTED, [dataPart({ error: { code: "ACTION_NOT_SUPPORTED", message: `Unknown or not-allowed action ${JSON.stringify(actionId)}. Allowed: ${A2A_ACTIONS.map((x) => x.id).join(", ")}, submit. Approving and confirming are never available to agents.` } })]);
      const out = await this.client.invoke(a.id, args, { idempotencyKey: `a2a-${ctx.taskId}-1` });
      const approval = out?.disclosure?.approval ?? out?.result?.approval;
      const submit = approval && SUBMIT_FOR[a.id]?.(out, args);
      if (approval && submit) {
        const page = new URL(approval.approval_url, this.base).toString();
        this.pending.set(ctx.taskId, { submit, page, workflow_id: args.workflow_id });
        return finish(TaskState.TASK_STATE_AUTH_REQUIRED, [textPart("Nothing is sent yet. Show the user this approval page. Only the user can approve, there, with a code sent to their own contact. Then send olip_action 'submit' on this task."), urlPart(page), dataPart({ prepared: out })]);
      }
      return finish(TaskState.TASK_STATE_COMPLETED, [textPart(`OLIP ${a.id} done.`)], out, { workflow_id: args.workflow_id ?? out?.workflow?.workflow_id ?? null });
    } catch (e) { return fail(e); }
  }
  async cancelTask(taskId, bus) { this.pending.delete(taskId); bus.publish(AgentEvent.statusUpdate({ taskId, contextId: "", status: { state: TaskState.TASK_STATE_CANCELED, message: undefined, timestamp: new Date().toISOString() }, metadata: undefined })); bus.finished(); }
}

// Starts the A2A server on 127.0.0.1. Returns { url, base, card, stop }.
export async function startAgentA2A({ client, publicBase, port = 0 }) {
  const app = express();
  const server = await new Promise((r) => { const s = app.listen(port, "127.0.0.1", () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`, url = `${base}/a2a/jsonrpc`;
  const card = agentCard(url);
  const handler = new DefaultRequestHandler(card, new InMemoryTaskStore(), new OlipAgentExecutor(client, publicBase));
  app.use("/.well-known/agent-card.json", agentCardHandler({ agentCardProvider: async () => card }));
  app.use("/a2a/jsonrpc", express.json({ limit: "512kb" }), jsonRpcHandler({ requestHandler: handler, userBuilder: UserBuilder.noAuthentication }));
  return { url, base, card, stop: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}
