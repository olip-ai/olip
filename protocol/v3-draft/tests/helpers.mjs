// Shared helpers for the OLIP 3.0-draft tests. Fictional data only; every server listens on 127.0.0.1.
import assert from "node:assert/strict";
import { startV3System, httpTransport } from "../reference/system.mjs";
import { createResponseChecker } from "../conformance/schema-check.mjs";
import { people, approve, staff, acts, v2view, runJourney } from "../reference/journey.mjs";
import { CASEBRIEF, FIRMS, SCREEN_FIELDS, ASSISTANT_ENCRYPTION_KEYS, OPERATOR, AGENT_CLIENTS } from "../reference/fixtures.mjs";
import { OlipAgentClient, OlipError } from "../sdk/typescript/dist/index.js";
export { httpTransport, people, approve, staff, acts, v2view, runJourney, CASEBRIEF, FIRMS, SCREEN_FIELDS, ASSISTANT_ENCRYPTION_KEYS, OPERATOR, AGENT_CLIENTS, OlipAgentClient, OlipError };

// Every response the 3.0 layer returns, in every test, is checked against the published schemas when the system stops.
export const responseCheck = createResponseChecker();
export async function startSystem(opts = {}) {
  const sys = await startV3System({ webhooks: { baseDelayMs: 5, maxAttempts: 3, timeoutMs: 1000 }, ...opts, observe: responseCheck.observe });
  const stop = sys.stop;
  sys.stop = async () => { await stop(); assert.deepEqual(responseCheck.problems.slice(0, 8), [], "live responses must match the published schemas"); };
  return sys;
}
// Runs a promise and returns the OLIP error code it failed with, or "no_error".
export const codeOf = async (p) => { try { await p; return "no_error"; } catch (e) { return e.code; } };
export const errOf = async (p) => { try { await p; return null; } catch (e) { return e; } };
export const casebrief = (patch = {}) => ({ ...structuredClone(CASEBRIEF), ...patch });

// A workflow whose screening was sent to `org` with the user's approval (and optionally marked eligible by the firm).
export async function sentScreening(sys, who, { org = "org_test_alvarez", eligible = false, cb = CASEBRIEF } = {}) {
  const wf = (await who.alpha.startWorkflow(cb)).workflow;
  const pv = (await who.alpha.previewDisclosure(wf.workflow_id, org, "screening", SCREEN_FIELDS)).disclosure;
  await approve(sys, who, pv.approval);
  const sent = await who.alpha.submitApprovedDisclosure(pv);
  if (eligible) {
    const atty = (Object.values(FIRMS[org].staff).find((s) => s.role === "intake_staff") ?? Object.values(FIRMS[org].staff).find((s) => s.role === "attorney")).actor_id;
    const st = await staff(sys, org, atty);
    const scr = sys.v2.host.state.objects.get(sent.lifecycle_object.id);
    const r = await st.act(acts.screenAct({ id: scr.id, matter_id: scr.matter_id }, "intake.eligible_for_further_intake"));
    assert.ok(r.status < 300, JSON.stringify(r.body));
  }
  return { wf, pv, sent };
}
// Raw HTTP call to the combined origin (for header-level and malformed-input tests).
export async function raw(sys, method, path, { body, headers = {}, token } = {}) {
  const r = await fetch(sys.base + path, { method, headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  const text = await r.text(); let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { status: r.status, body: parsed, headers: Object.fromEntries(r.headers) };
}
export async function operatorToken(sys) { return (await raw(sys, "POST", "/mock/v3/operator-token", { body: { secret: OPERATOR.secret } })).body.operator_token; }
export const invokeAs = (sys, token, actionId, input, key = `t-${Math.random().toString(36).slice(2, 14)}`) =>
  raw(sys, "POST", `/olip/v3/actions/${actionId}/invoke`, { body: input, token, headers: { "idempotency-key": key, "olip-version": "3.0-draft.1" } });
