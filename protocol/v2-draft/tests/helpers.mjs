// Shared helpers for the OLIP 2.0-draft tests. Fictional data only; every server listens on 127.0.0.1.
import assert from "node:assert/strict";
import { startSystem as startRaw, httpTransport } from "../reference/system.mjs";
import { createResponseChecker } from "../conformance/schema-check.mjs";
import { actors, userApproves, staff, acts, reauth, runScenarioA } from "../reference/journey.mjs";
import { CASEBRIEF, FIRMS } from "../reference/fixtures.mjs";
import { digestOf, signDetached, keyFromLabel } from "../reference/lib/core.mjs";
export { startSystem, httpTransport, actors, userApproves, staff, acts, reauth, runScenarioA, CASEBRIEF, FIRMS, digestOf, signDetached, keyFromLabel };
// Every response in every test is checked against the published JSON Schemas; a mismatch fails the test file.
export const responseCheck = createResponseChecker();
// The check runs when a test file stops its system, after the servers are closed, so a failure never leaves a server running.
const startSystem = async (opts = {}) => {
  const sys = await startRaw({ ...opts, observe: responseCheck.observe });
  const stop = sys.stop;
  sys.stop = async () => { await stop(); assert.deepEqual(responseCheck.problems.slice(0, 8), [], "live responses must match the published schemas"); };
  return sys;
};
export const SCREEN_FIELDS = ["prospective_client.name", "adverse_parties", "matter.category", "matter.jurisdiction"];
export const expectErr = (r, status, code) => { assert.equal(r.status, status, JSON.stringify(r.body)); if (code) assert.equal(r.body.error.code, code, JSON.stringify(r.body)); return r.body; };
export const ok = (r, status) => { assert.ok(r.status < 400, `${r.status} ${JSON.stringify(r.body)}`); if (status) assert.equal(r.status, status); return r.body; };
export const casebrief = (patch = {}) => ({ ...structuredClone(CASEBRIEF), ...patch });

// Matter whose screening at `org` is eligible_for_further_intake (the common precondition for later stages).
export async function eligibleMatter(sys, a, org = "org_test_alvarez", cb = casebrief()) {
  const m = (await a.ai.createMatter(cb, { fictional: true })).matter;
  const req = await a.ai.requestConflictScreen(m.matter_id, org, SCREEN_FIELDS);
  await userApproves(sys, a.user, req.approval);
  const sub = await a.ai.submitConflictScreen(req.conflict_screen.id, req.approval);
  const st = await staff(sys, org, Object.values(FIRMS[org].staff).find((s) => s.role === "attorney").actor_id);
  const el = ok(await st.act(acts.screenAct(sub.conflict_screen, "intake.eligible_for_further_intake")));
  return { m, screen: el.conflict_screen, req };
}
// Signs an arbitrary firm event with a chosen key and posts it with the firm's own host token (bypasses the firm's local role check).
export async function rawFirmEvent(sys, org, { path, event }) {
  return sys.firms[org].admin.hostCall("POST", path, { event }, { idem: event.idempotency_key });
}
export function firmEvent(sys, org, { actor_id, object, matter_id, event_type, prior_revision, payload = {}, evidence = {}, key, occurred_at, event_id }) {
  const k = key || sys.firms[org].admin.activeKey;
  return signDetached({ olip_version: "2.0-draft", event_id: event_id || `urn:olip:${org}:event:t${Math.random().toString(36).slice(2)}`, matter_id, object, event_type,
    actor: { role: "firm", actor_id, organization_id: org, staff_role: "test" }, prior_revision, occurred_at: occurred_at || sys.clock.now().toISOString(), idempotency_key: `idem-${Math.random()}`, correlation_id: matter_id, causation_id: null, evidence, payload, fictional: true }, k);
}
export const obj = (sys, id) => sys.host.state.objects.get(id);
