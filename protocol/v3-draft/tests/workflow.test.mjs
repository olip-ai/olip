// Durable workflows and the signed, hash-chained event journal: pagination, cursor integrity, gap detection,
// a 1,000+ event property check (any single change, removal or reordering is detected at the right place), and a
// restart of the 3.0 layer from its store with cursors and idempotent replays intact.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hmac } from "../reference/lib/core.mjs";
import { startV3System } from "../reference/system.mjs";
import { verifyJournal, OlipAgentClient } from "../sdk/typescript/dist/index.js";
import { startSystem, people, approve, sentScreening, codeOf, casebrief, SCREEN_FIELDS, responseCheck } from "./helpers.mjs";

let sys, who;
before(async () => { sys = await startSystem(); who = await people(sys); });
after(() => sys.stop());
// Seeded pseudo-random numbers so a failure is reproducible.
const rng = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

test("events page with signed cursors; a tampered, foreign or ahead-of-journal cursor and a wrong last_seen_digest are refused", async () => {
  const { wf } = await sentScreening(sys, who);
  const keys = await who.alpha.keys();
  const p1 = await who.alpha.listEvents(wf.workflow_id, { limit: 2 });
  assert.equal(p1.entries.length, 2); assert.equal(p1.has_more, true); assert.equal(p1.chain.ok, true);
  assert.ok((await verifyJournal(p1.entries, keys)).ok);
  const p2 = await who.alpha.listEvents(wf.workflow_id, { cursor: p1.next_cursor, last_seen_digest: p1.entries[1].event_digest, limit: 100 });
  assert.equal(p2.entries[0].sequence, 3);
  assert.ok((await verifyJournal(p2.entries, keys, p1.entries[1].event_digest)).ok);
  const [c, b, mac] = p1.next_cursor.split(".");
  const forgedBody = Buffer.from(JSON.stringify({ w: wf.workflow_id, s: 0 })).toString("base64url");
  assert.equal(await codeOf(who.alpha.listEvents(wf.workflow_id, { cursor: `${c}.${forgedBody}.${mac}` })), "SCHEMA_INVALID");
  const other = (await who.alpha.startWorkflow(casebrief())).workflow;
  assert.equal(await codeOf(who.alpha.listEvents(other.workflow_id, { cursor: p1.next_cursor })), "SCHEMA_INVALID");
  assert.equal(await codeOf(who.alpha.listEvents(wf.workflow_id, { cursor: p1.next_cursor, last_seen_digest: "sha256:" + "5".repeat(64) })), "EVENT_CURSOR_GAP");
  // A cursor this host signed for a position beyond its journal (as after a restore from an older backup).
  const secret = Buffer.from(hmac("olip-3.0-draft cursor", sys.layer.hostLabel));
  const ahead = Buffer.from(JSON.stringify({ w: wf.workflow_id, s: 9999 })).toString("base64url");
  const e = await who.alpha.listEvents(wf.workflow_id, { cursor: `c1.${ahead}.${hmac(secret, ahead).slice(0, 22)}` }).catch((x) => x);
  assert.equal(e.code, "EVENT_CURSOR_GAP"); assert.equal(e.body.error.retryable, false);
  assert.equal(b.length > 0, true);
});
test("journal entries carry references, never CaseBrief content, and mirrored 2.0 entries point at the 2.0 hash chain", async () => {
  const { wf } = await sentScreening(sys, who, { eligible: true });
  const all = (await who.alpha.resume(wf.workflow_id)).entries;
  assert.ok(!JSON.stringify(all).includes("Bayview") && !JSON.stringify(all).includes("SYSTEM NOTE"));
  const mirrored = all.filter((e) => e.source === "olip_2_0_draft_lifecycle");
  assert.ok(mirrored.length >= 3);
  const v2j = sys.v2.host.state.journals.get(wf.matter_id);
  for (const e of mirrored) assert.equal(v2j.find((x) => x.seq === e.v2_ref.seq).entry_hash, e.v2_ref.entry_hash);
  assert.ok(all.every((e) => e.privacy_scope === "participant_minimum" && e.fictional === true));
});
test("property: across 1,000+ events, every page boundary verifies, and any single change, removal or reordering is caught at that entry", async () => {
  const wf = (await who.alpha.startWorkflow(casebrief())).workflow;
  const h = { authorization: `Bearer ${who.user.token}` };
  for (let i = 0; i < 1010; i++) {
    const r = await sys.layer.invoke({ headers: h, actionId: "olip.export_context_capsule", input: { workflow_id: wf.workflow_id, include_fields: [], purpose: "personal_record" }, idempotencyKey: `prop-export-${String(i).padStart(5, "0")}` });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const keys = await who.alpha.keys();
  const rand = rng(20261114);
  const pages = []; let cursor, last;
  for (;;) {
    const limit = 1 + Math.floor(rand() * 100);
    const p = await who.alpha.listEvents(wf.workflow_id, { ...(cursor ? { cursor, last_seen_digest: last } : {}), limit });
    const v = await verifyJournal(p.entries, keys, last ?? "sha256:" + "0".repeat(64));
    assert.ok(v.ok, `page at ${p.entries[0]?.sequence}`);
    pages.push(...p.entries); cursor = p.next_cursor; last = v.last_digest;
    if (!p.has_more) break;
  }
  assert.ok(pages.length >= 1011, String(pages.length));
  assert.deepEqual(pages.map((e) => e.sequence), pages.map((_, i) => i + 1));
  const mutations = [
    (e) => ({ ...e, payload: { ...e.payload, injected: true } }), (e) => ({ ...e, recorded_at: "2020-01-01T00:00:00.000Z" }),
    (e) => ({ ...e, actor_type: "firm_authorized_actor" }), (e) => ({ ...e, signature: { ...e.signature, value: e.signature.value.slice(0, 10) + (e.signature.value[10] === "A" ? "B" : "A") + e.signature.value.slice(11) } }),
  ];
  for (let k = 0; k < 60; k++) {
    const i = Math.floor(rand() * pages.length);
    const copy = pages.slice(); copy[i] = mutations[k % mutations.length](pages[i]);
    const v = await verifyJournal(copy, keys);
    assert.equal(v.ok, false); assert.equal(v.at, i + 1, `mutation ${k % mutations.length} at ${i + 1}`);
  }
  const i = 1 + Math.floor(rand() * (pages.length - 2));
  const removed = pages.filter((_, j) => j !== i);
  assert.deepEqual([(await verifyJournal(removed, keys)).ok, (await verifyJournal(removed, keys)).reason], [false, "chain_gap"]);
  const swapped = pages.slice(); [swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]];
  assert.equal((await verifyJournal(swapped, keys)).ok, false);
});
test("restart: a new 3.0 layer on the same store keeps ids, cursors, the chain and idempotent replays; nothing is sent twice", async () => {
  const dir = mkdtempSync(join(tmpdir(), "olip-v3-store-"));
  const storePath = join(dir, "store.json");
  const s1 = await startV3System({ storePath, observe: responseCheck.observe, webhooks: { baseDelayMs: 5, maxAttempts: 2 } });
  try {
    const w1 = await people(s1);
    const wf = (await w1.alpha.startWorkflow(casebrief())).workflow;
    const pv = (await w1.alpha.previewDisclosure(wf.workflow_id, "org_test_alvarez", "screening", SCREEN_FIELDS)).disclosure;
    await approve(s1, w1, pv.approval);
    const first = await w1.alpha.submitApprovedDisclosure(pv, { idempotencyKey: "restart-submit-0001" });
    const saved = await w1.alpha.resume(wf.workflow_id);
    await s1.stopLayer();
    assert.ok(!readFileSync(storePath, "utf8").includes("Bayview"), "the snapshot holds no CaseBrief content");
    const s2 = await startV3System({ existingV2: s1.v2, storePath, observe: responseCheck.observe });
    try {
      const alpha = new OlipAgentClient(s2.base, { token: w1.alpha.token });
      assert.equal((await alpha.getWorkflow(wf.workflow_id)).workflow.workflow_id, wf.workflow_id);
      const again = await alpha.submitApprovedDisclosure(pv, { idempotencyKey: "restart-submit-0001" });
      assert.equal(again.idempotent_replay, true); assert.deepEqual(again.delivery, first.delivery);
      assert.equal([...s1.v2.host.state.objects.values()].filter((o) => o.type === "disclosure" && o.matter_id === wf.matter_id).length, 1);
      await alpha.cancelPending((await alpha.previewDisclosure(wf.workflow_id, "org_test_cedar", "screening", SCREEN_FIELDS)).disclosure.disclosure_id);
      const more = await alpha.resume(wf.workflow_id, { cursor: saved.cursor, last_digest: saved.last_digest });
      assert.ok(more.entries.length >= 2);
      assert.equal(more.entries[0].previous_event_digest, saved.last_digest, "the chain continues across the restart");
      assert.deepEqual((await alpha.keys()).map((k) => k.kid).sort(), s1.layer.jwks().map((k) => k.kid).sort(), "same host label, same keys");
    } finally { await s2.stop(); }
  } finally { await s1.v2.stop(); rmSync(dir, { recursive: true, force: true }); }
});
