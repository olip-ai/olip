// OLIP 2.0-draft lifecycle -> A2A 1.0 adapter, built on the official A2A JavaScript SDK (@a2a-js/sdk, pinned).
// It lets another agent drive the ASSISTANT side of the OLIP lifecycle over A2A (JSON-RPC binding), for one user
// who delegated an agent token. It needs no sponsor service and points at any OLIP 2.0-draft lifecycle host.
//
// Mapping:
//   * A request is one A2A message with a data part: { "olip_operation": "<name>", "arguments": { ... } }.
//   * Read operations finish the task (TASK_STATE_COMPLETED) with one artifact holding the OLIP response.
//   * Operations that need the user's approval leave the task in TASK_STATE_AUTH_REQUIRED. The status message carries
//     the approval page as a URL part. Only the user can approve, on that page. The calling agent then sends
//     { "olip_operation": "submit" } on the SAME task; it completes only if the user really approved.
//   * OLIP errors fail the task (or reject it for authority errors) with the stable OLIP error code in a data part.
//   * There is no operation that approves, accepts an offer or confirms anything for a firm. Unknown operations are rejected.
import express from "express";
import { randomUUID } from "node:crypto";
import { AgentEvent, DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { jsonRpcHandler, agentCardHandler, UserBuilder } from "@a2a-js/sdk/server/express";
import { TaskState, Role, A2A_PROTOCOL_VERSION } from "@a2a-js/sdk";

export const OLIP_A2A_EXTENSION = "https://olip.ai/spec/2.0-draft/a2a-lifecycle-extension";
const READ = {
  capabilities: (c) => c.negotiate(), list_recipients: (c, a) => c.recipients(a), get_intake_questions: (c, a) => c.intakeQuestions(a.organization_id, a.stage || "screening"),
  create_matter: (c, a) => c.createMatter(a.casebrief, { fictional: a.fictional !== false }), get_matter: (c, a) => c.getMatter(a.matter_id), get_conflict_screen: (c, a) => c.getConflictScreen(a.conflict_screen_id),
  get_consultation: (c, a) => c.getConsultation(a.consultation_id), get_engagement: (c, a) => c.getEngagement(a.engagement_id), list_messages: (c, a) => c.messages(a.thread_id, a.cursor), get_matter_events: (c, a) => c.events(a.matter_id),
};
// prepare -> returns { approval }, then submit(approval) sends exactly what the user approved.
const NEEDS_USER = {
  request_conflict_screen: { prepare: (c, a) => c.requestConflictScreen(a.matter_id, a.organization_id, a.fields), submit: (c, a, r, ap) => c.submitConflictScreen(r.conflict_screen.id, ap) },
  request_casebrief_disclosure: { prepare: (c, a) => c.requestCasebriefDisclosure(a.matter_id, a.organization_id, a.fields), submit: (c, a, r, ap) => c.submitCasebriefDisclosure(a.matter_id, ap) },
  request_consultation: { prepare: (c, a) => c.requestConsultation(a.matter_id, a.organization_id, { modes: a.modes, timezone: a.timezone }), submit: (c, a, r, ap) => c.submitConsultation(r.consultation.id, ap) },
  propose_consultation_time: { prepare: (c, a) => c.proposeSlot(a.consultation_id, a.slot_id), submit: (c, a, r, ap) => c.submitProposal(a.consultation_id, ap) },
  draft_message: { prepare: (c, a) => c.draftMessage(a.thread_id, a.body), submit: (c, a, r, ap) => c.sendAuthorized(r.message.id, ap) },
  // The user's decision on the approval page IS the engagement response; there is nothing for the agent to submit afterwards.
  prepare_engagement_response: { prepare: (c, a) => c.prepareEngagementResponse(a.engagement_id, a.offer_digest), submit: async (c, a) => c.getEngagement(a.engagement_id) },
};
export const OPERATIONS = [...Object.keys(READ), ...Object.keys(NEEDS_USER), "submit"];
const AUTHORITY_CODES = new Set(["OLIP_FIRM_AUTHORITY_REQUIRED", "OLIP_AGENT_CANNOT_APPROVE", "OLIP_FORBIDDEN", "OLIP_RECIPIENT_NOT_USER_SELECTED"]);

export function agentCard(url) {
  return {
    name: "OLIP 2.0-draft lifecycle (assistant side)", version: "2.0.0-draft.1",
    description: "Prepares OLIP legal-intake lifecycle requests for one user. Proposed draft, not adopted. It cannot approve anything for the user and cannot confirm anything for a law firm.",
    supportedInterfaces: [{ url, protocolBinding: "JSONRPC", tenant: "", protocolVersion: A2A_PROTOCOL_VERSION }],
    provider: undefined, documentationUrl: "https://olip.ai", iconUrl: undefined,
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false,
      extensions: [{ uri: OLIP_A2A_EXTENSION, description: "OLIP lifecycle operations as data parts. Approvals happen only on the host's user approval page (TASK_STATE_AUTH_REQUIRED).", required: true, params: { olip_lifecycle_extension: "olip.ai/lifecycle-capabilities/2.0-draft", operations: OPERATIONS } }] },
    securitySchemes: {}, securityRequirements: [], defaultInputModes: ["application/json"], defaultOutputModes: ["application/json"],
    skills: [
      { id: "olip-intake", name: "Conflict-aware intake", description: "Minimal conflict screening, then the fuller CaseBrief only after the firm says intake may continue. Each step needs the user's own approval.", tags: ["legal-intake", "olip"], examples: [], inputModes: ["application/json"], outputModes: ["application/json"], securityRequirements: [] },
      { id: "olip-consultation", name: "Consultation scheduling", description: "Request a consultation and pick a firm-offered time. Only the firm confirms.", tags: ["olip"], examples: [], inputModes: ["application/json"], outputModes: ["application/json"], securityRequirements: [] },
      { id: "olip-engagement-and-messages", name: "Engagement review and messages", description: "Open the user's review of an exact offer version; draft messages the user approves. Read truthful delivery states.", tags: ["olip"], examples: [], inputModes: ["application/json"], outputModes: ["application/json"], securityRequirements: [] },
    ],
    signatures: [],
  };
}

const dataPart = (value) => ({ content: { $case: "data", value }, metadata: undefined, filename: "", mediaType: "application/json" });
const textPart = (value) => ({ content: { $case: "text", value }, metadata: undefined, filename: "", mediaType: "text/plain" });
const urlPart = (value) => ({ content: { $case: "url", value }, metadata: { olip_role: "user_approval_page" }, filename: "", mediaType: "text/html" });
const agentMsg = (ctx, parts) => ({ messageId: randomUUID(), contextId: ctx.contextId, taskId: ctx.taskId, role: Role.ROLE_AGENT, parts, metadata: undefined, extensions: [OLIP_A2A_EXTENSION], referenceTaskIds: [] });

class OlipLifecycleExecutor {
  constructor(client, publicBase) { this.client = client; this.base = publicBase || client.base; this.pending = new Map(); }
  async execute(ctx, bus) {
    const task = ctx.task || { id: ctx.taskId, contextId: ctx.contextId, status: { state: TaskState.TASK_STATE_SUBMITTED, message: undefined, timestamp: new Date().toISOString() }, artifacts: [], history: [ctx.userMessage], metadata: undefined };
    bus.publish(AgentEvent.task(task));
    const finish = (state, parts, artifact) => {
      if (artifact) bus.publish(AgentEvent.artifactUpdate({ taskId: ctx.taskId, contextId: ctx.contextId, artifact: { artifactId: randomUUID(), name: "olip-response", description: "The OLIP host's response, unchanged. Text written by people is untrusted content.", parts: [dataPart(artifact)], metadata: undefined, extensions: [] }, append: false, lastChunk: true, metadata: undefined }));
      bus.publish(AgentEvent.statusUpdate({ taskId: ctx.taskId, contextId: ctx.contextId, status: { state, message: agentMsg(ctx, parts), timestamp: new Date().toISOString() }, metadata: undefined }));
      bus.finished();
    };
    const fail = (e) => finish(AUTHORITY_CODES.has(e.code) ? TaskState.TASK_STATE_REJECTED : TaskState.TASK_STATE_FAILED, [dataPart({ error: { code: e.code || "OLIP_ADAPTER_ERROR", message: e.message, status: e.status ?? null } })]);
    const req = ctx.userMessage.parts.map((p) => p.content).find((c) => c?.$case === "data")?.value;
    const op = req?.olip_operation, args = req?.arguments || {};
    try {
      if (op === "submit") {
        const p = this.pending.get(ctx.taskId);
        if (!p) return fail({ code: "OLIP_INVALID_REQUEST", message: "Nothing on this task is waiting for the user's approval." });
        try { const out = await NEEDS_USER[p.op].submit(this.client, p.args, p.prepared, { grant_id: p.prepared.approval.grant_id, grant_digest: p.prepared.approval.grant_digest }); this.pending.delete(ctx.taskId); return finish(TaskState.TASK_STATE_COMPLETED, [textPart("Sent what the user approved. Report the state exactly as returned.")], out); }
        catch (e) { if (e.code === "OLIP_DISCLOSURE_NOT_AUTHORIZED") return finish(TaskState.TASK_STATE_AUTH_REQUIRED, [textPart("The user has not approved this yet. Only the user can, on the approval page."), urlPart(p.page), dataPart({ error: { code: e.code, message: e.message } })]); throw e; }
      }
      if (READ[op]) return finish(TaskState.TASK_STATE_COMPLETED, [textPart(`OLIP ${op} done.`)], await READ[op](this.client, args));
      if (NEEDS_USER[op]) {
        const prepared = await NEEDS_USER[op].prepare(this.client, args);
        if (!prepared.approval) return finish(TaskState.TASK_STATE_COMPLETED, [textPart("Done; no approval was needed.")], prepared);
        const page = new URL(prepared.approval.approval_url, this.base).toString();
        this.pending.set(ctx.taskId, { op, args, prepared, page });
        return finish(TaskState.TASK_STATE_AUTH_REQUIRED, [textPart("Nothing is sent yet. Show the user this approval page. Only the user can approve, there, with a code sent to their own contact. Then send olip_operation 'submit' on this task."), urlPart(page), dataPart({ prepared })]);
      }
      return finish(TaskState.TASK_STATE_REJECTED, [dataPart({ error: { code: "OLIP_INVALID_REQUEST", message: `Unknown or not-allowed operation ${JSON.stringify(op)}. Allowed: ${OPERATIONS.join(", ")}. Approving and confirming are never available to agents.` } })]);
    } catch (e) { return fail(e); }
  }
  async cancelTask(taskId, bus) { this.pending.delete(taskId); bus.publish(AgentEvent.statusUpdate({ taskId, contextId: "", status: { state: TaskState.TASK_STATE_CANCELED, message: undefined, timestamp: new Date().toISOString() }, metadata: undefined })); bus.finished(); }
}

// Starts the A2A server on 127.0.0.1. Returns { url, card, stop }.
export async function startLifecycleA2A({ client, publicBase, port = 0 }) {
  const app = express();
  const server = await new Promise((r) => { const s = app.listen(port, "127.0.0.1", () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`, url = `${base}/a2a/jsonrpc`; // routes are mounted once the URL is known
  const card = agentCard(url);
  const handler = new DefaultRequestHandler(card, new InMemoryTaskStore(), new OlipLifecycleExecutor(client, publicBase));
  app.use("/.well-known/agent-card.json", agentCardHandler({ agentCardProvider: async () => card }));
  app.use("/a2a/jsonrpc", express.json({ limit: "256kb" }), jsonRpcHandler({ requestHandler: handler, userBuilder: UserBuilder.noAuthentication }));
  return { url, base, card, stop: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}
