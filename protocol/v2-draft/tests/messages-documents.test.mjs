// Communications: per-message approval, truthful delivery, observers, revocation, closure rules, logistics pre-approval, documents.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startSystem, actors, userApproves, staff, acts, eligibleMatter, expectErr, ok, obj, httpTransport } from "./helpers.mjs";
import { EICAR } from "../reference/lib/core.mjs";
let sys, a;
before(async () => { sys = await startSystem({ orgs: ["org_test_alvarez", "org_test_northgate"] }); a = await actors(sys); });
after(() => sys.stop());
async function thread(org = "org_test_alvarez") { const { m } = await eligibleMatter(sys, a, org); return { m, t: ok(await a.ai.request("POST", `/olip/v2/matters/${m.matter_id}/threads`, { organization_id: org })).thread }; }
const firmMsg = (t, body, more = {}) => sys.firms[t.organization_id].admin.act(more.actor || "stf_test_riley", { event_type: "message.firm_sent", matter_id: t.matter_id, object: { type: "thread", id: t.id }, object_path: `/olip/v2/threads/${t.id}`, post_path: `/olip/v2/threads/${t.id}/messages`, payload: { body, category: more.category || "substantive", drafting: more.drafting } });
async function upload(c, { name = "note.txt", mime = "text/plain", bytes = Buffer.from("fictional note\n"), size } = {}) {
  const ua = await c.request("POST", "/olip/v2/documents/upload-authorizations", { matter_id: c._m, filename: name, declared_mime: mime, size: size ?? bytes.length });
  if (ua.status >= 400) return ua;
  return c.request("PUT", ua.body.upload_url, { content_base64: bytes.toString("base64") }, { "x-olip-upload-token": ua.body.upload_token });
}

test("each substantive message needs its own approval bound to its exact text", async () => {
  const { t } = await thread();
  const d = await a.ai.draftMessage(t.id, "Fictional: version one");
  assert.equal(d.message.state, "draft"); assert.ok(d.approval);
  expectErr(await a.ai.request("POST", `/olip/v2/messages/${d.message.id}/send`, {}), 403, "OLIP_DISCLOSURE_NOT_AUTHORIZED");
  const d2 = await a.ai.draftMessage(t.id, "Fictional: version two");
  await userApproves(sys, a.user, d.approval);
  expectErr(await a.ai.request("POST", `/olip/v2/messages/${d2.message.id}/send`, d.approval), 403, "OLIP_DISCLOSURE_NOT_AUTHORIZED");
  const s = await a.ai.sendAuthorized(d.message.id, d.approval);
  assert.equal(s.message.state, "delivered_to_endpoint"); assert.equal(s.message.receipt.organization_id, "org_test_alvarez");
  const firmView = (await sys.firms.org_test_alvarez.admin.hostCall("GET", `/olip/v2/threads/${t.id}/messages`)).body.messages;
  assert.ok(!firmView.some((x) => x.id === d2.message.id), "unsent drafts are invisible to the firm");
});
test("transport acceptance is not delivery; no firm reply is synthesized", async () => {
  const { t } = await thread("org_test_northgate");
  sys.offline.add("org_test_northgate"); // the firm's endpoint goes offline after screening; the relay still accepts
  const d = await a.ai.draftMessage(t.id, "Fictional: are you there?");
  await userApproves(sys, a.user, d.approval);
  const s = await a.ai.sendAuthorized(d.message.id, d.approval);
  assert.equal(s.message.state, "accepted_by_transport"); assert.match(s.delivery.statement, /has not confirmed/);
  const msgs = (await a.ai.messages(t.id)).messages; assert.equal(msgs.length, 1);
  sys.offline.delete("org_test_northgate");
});
test("firm messages are signed and labeled; AI-drafted firm text is never shown as attorney-reviewed unless the firm says so", async () => {
  const { t } = await thread();
  const r1 = ok(await firmMsg(t, "Fictional reply A", { drafting: { ai_assisted: true, reviewed_by: null } }));
  assert.match(r1.message.labels.statement, /does not say a person reviewed/);
  const r2 = ok(await firmMsg(t, "Fictional reply B", { drafting: { ai_assisted: true, reviewed_by: "stf_test_avery" } }));
  assert.match(r2.message.labels.statement, /named staff member reviewed/);
  assert.equal(r2.message.state, "delivered_to_endpoint");
  const page = await a.ai.messages(t.id);
  assert.equal(page.messages[0].body.untrusted_content, true);
});
test("observers see status only and lose access when removed; earlier reads cannot be clawed back", async () => {
  const { m, t } = await thread();
  await firmMsg(t, "Fictional: hello");
  const avery = await staff(sys, "org_test_alvarez", "stf_test_avery");
  ok(await avery.act({ event_type: "thread.participant_added", matter_id: m.matter_id, object: { type: "thread", id: t.id }, object_path: `/olip/v2/threads/${t.id}`, post_path: `/olip/v2/threads/${t.id}/events`, payload: { organization_id: "org_test_observer" } }));
  const obs = httpTransport(sys.hostBase);
  const tok = (await obs.call("POST", "/olip/v2/token", { grant_type: "client_credentials", client_id: "obs_test_cocounsel", client_secret: "test-only-observer-secret" })).body.access_token;
  const H = { authorization: `Bearer ${tok}` };
  const seen = ok(await obs.call("GET", `/olip/v2/threads/${t.id}/messages`, null, H));
  assert.equal(seen.messages[0].body, null);
  expectErr(await obs.call("POST", `/olip/v2/threads/${t.id}/messages`, { body: "x" }, { ...H, "idempotency-key": "o1" }), 403, "OLIP_FORBIDDEN");
  ok(await avery.act({ event_type: "thread.participant_removed", matter_id: m.matter_id, object: { type: "thread", id: t.id }, object_path: `/olip/v2/threads/${t.id}`, post_path: `/olip/v2/threads/${t.id}/events`, payload: { organization_id: "org_test_observer" } }));
  const denied = expectErr(await obs.call("GET", `/olip/v2/threads/${t.id}/messages`, null, H), 403, "OLIP_THREAD_MEMBERSHIP_REQUIRED");
  assert.match(denied.error.message, /cannot be taken back/);
});
test("logistics pre-approval is narrow: fixed templates only, use-limited, expiring and revocable", async () => {
  const { t } = await thread();
  const pre = ok(await a.ai.request("POST", `/olip/v2/threads/${t.id}/logistics-preauthorizations`, { templates: ["running_late"], max_uses: 1, hours: 4 })).approval;
  await userApproves(sys, a.user, pre);
  const m1 = ok(await a.ai.request("POST", `/olip/v2/threads/${t.id}/messages`, { category: "logistics", template: "running_late", body: "ignored free text" }));
  assert.equal(m1.approval, undefined);
  const s1 = ok(await a.ai.request("POST", `/olip/v2/messages/${m1.message.id}/send`, pre));
  assert.equal(s1.message.state, "delivered_to_endpoint");
  assert.equal(s1.message.body.value, "I am running about 10 minutes late for our appointment.");
  const m2 = ok(await a.ai.request("POST", `/olip/v2/threads/${t.id}/messages`, { category: "logistics", template: "running_late" }));
  expectErr(await a.ai.request("POST", `/olip/v2/messages/${m2.message.id}/send`, pre), 410, "OLIP_AUTHORIZATION_EXPIRED");
  const m3 = ok(await a.ai.request("POST", `/olip/v2/threads/${t.id}/messages`, { category: "logistics", template: "confirm_attendance" }));
  expectErr(await a.ai.request("POST", `/olip/v2/messages/${m3.message.id}/send`, pre), 403, "OLIP_DISCLOSURE_NOT_AUTHORIZED");
  const sub = await a.ai.draftMessage(t.id, "Fictional substantive text");
  expectErr(await a.ai.request("POST", `/olip/v2/messages/${sub.message.id}/send`, pre), 403, "OLIP_DISCLOSURE_NOT_AUTHORIZED");
  expectErr(await a.ai.request("POST", `/olip/v2/threads/${t.id}/messages`, { category: "logistics", template: "anything_else" }), 422, "OLIP_INVALID_REQUEST");
  expectErr(await a.ai.request("POST", `/olip/v2/threads/${t.id}/logistics-preauthorizations`, { templates: ["free_text"] }), 422, "OLIP_INVALID_REQUEST");
});
test("documents: allowlisted types, content sniffing, mock malware check, size limits, safe names, private storage", async () => {
  const { m, t } = await thread(); a.ai._m = m.matter_id;
  const good = ok(await upload(a.ai, { name: "../../etc/passwd<script>.txt" }));
  assert.equal(good.document.filename, "passwd_script_.txt"); assert.equal(good.document.scan.status, "clean"); assert.match(good.document.storage, /no public URL/);
  expectErr(await upload(a.ai, { name: "x.exe", mime: "application/x-msdownload" }), 422, "OLIP_DOCUMENT_REJECTED");
  const forged = expectErr(await upload(a.ai, { name: "fake.pdf", mime: "application/pdf", bytes: Buffer.from("MZ\x90\x00 not a pdf") }), 422, "OLIP_DOCUMENT_REJECTED");
  assert.equal(forged.error.reason, "content_does_not_match_declared_mime");
  const mal = expectErr(await upload(a.ai, { name: "eicar.txt", bytes: Buffer.from(EICAR) }), 422, "OLIP_DOCUMENT_REJECTED");
  assert.equal(mal.error.reason, "test_signature_found");
  const html = expectErr(await upload(a.ai, { name: "x.txt", bytes: Buffer.from("<script>alert(1)</script>") }), 422, "OLIP_DOCUMENT_REJECTED");
  assert.equal(html.error.reason, "active_content_declared_as_text");
  expectErr(await upload(a.ai, { size: 5_000_000 }), 413, "OLIP_PAYLOAD_TOO_LARGE");
  // a rejected document can never be attached or sent
  expectErr(await a.ai.request("POST", `/olip/v2/threads/${t.id}/documents`, { document_id: mal.error.document_id }), 422, "OLIP_DOCUMENT_NOT_CLEARED");
  // sending needs an approval bound to the SHA-256
  const ap = ok(await a.ai.request("POST", `/olip/v2/threads/${t.id}/documents`, { document_id: good.document.id })).approval;
  expectErr(await a.ai.request("POST", `/olip/v2/threads/${t.id}/documents`, { document_id: good.document.id, ...ap }), 403, "OLIP_DISCLOSURE_NOT_AUTHORIZED");
  await userApproves(sys, a.user, ap);
  assert.equal(ok(await a.ai.request("POST", `/olip/v2/threads/${t.id}/documents`, { document_id: good.document.id, ...ap })).delivery.state, "delivered_to_endpoint");
  const inbox = sys.firms.org_test_alvarez.admin.inbox.filter((x) => x.delivery.kind === "document");
  assert.equal(inbox.at(-1).delivery.payload.sha256, good.document.sha256);
});
test("download links are short-lived, never logged, and served as inert attachments", async () => {
  const { m } = await thread(); a.ai._m = m.matter_id;
  const d = ok(await upload(a.ai, { name: "n.txt" }));
  const dl = ok(await a.ai.request("POST", `/olip/v2/documents/${d.document.id}/download-authorizations`, {}));
  const r = await fetch(sys.hostBase + dl.download_url);
  assert.equal(r.status, 200); assert.equal(await r.text(), "fictional note\n");
  assert.match(r.headers.get("content-disposition"), /^attachment/); assert.equal(r.headers.get("x-content-type-options"), "nosniff"); assert.match(r.headers.get("content-security-policy"), /sandbox/);
  const logs = JSON.stringify((await httpTransport(sys.hostBase).call("GET", "/mock/v2/logs")).body.lines);
  assert.ok(!logs.includes(dl.download_url.split("/").pop()), "token not in logs");
  sys.clock.advance(301);
  assert.equal((await fetch(sys.hostBase + dl.download_url)).status, 410);
  const other = await actors(sys, { subject: "usr_test_morgan" });
  expectErr(await other.ai.request("POST", `/olip/v2/documents/${d.document.id}/download-authorizations`, {}), 404, "OLIP_NOT_FOUND");
  a = await actors(sys);
});
test("after the firm terminates: consumer messages refused, firm closing communication allowed, new thread refused", async () => {
  const { m, t } = await thread();
  const avery = await staff(sys, "org_test_alvarez", "stf_test_avery");
  // engagement needed: a represented matter can only be terminated by the engaged firm
  expectErr(await avery.act({ event_type: "matter.terminated", matter_id: m.matter_id, object: { type: "matter", id: m.matter_id }, object_path: `/olip/v2/matters/${m.matter_id}`, post_path: `/olip/v2/matters/${m.matter_id}/events`, payload: { notice_text: "x" } }), 403, "OLIP_FIRM_AUTHORITY_REQUIRED");
  const kim = await staff(sys, "org_test_northgate", "stf_test_kim");
  expectErr(await kim.act({ event_type: "matter.closed", matter_id: m.matter_id, object: { type: "matter", id: m.matter_id }, object_path: `/olip/v2/matters/${m.matter_id}`, post_path: `/olip/v2/matters/${m.matter_id}/events`, prior_revision: 0 }), 404, "OLIP_NOT_FOUND");
  // make it represented quickly
  const letter = Buffer.from("FICTIONAL LETTER\n");
  const up = ok(await avery.host("POST", "/olip/v2/documents/upload-authorizations", { matter_id: m.matter_id, filename: "l.txt", declared_mime: "text/plain", size: letter.length }));
  const doc = (await sys.firms.org_test_alvarez.admin.hostCall("PUT", up.upload_url, { content_base64: letter.toString("base64") }, { headers: { "x-olip-upload-token": up.upload_token } })).body.document;
  const target = ok(await avery.host("POST", `/olip/v2/matters/${m.matter_id}/engagements`, {})).engagement;
  const { digestOf } = await import("../reference/lib/core.mjs");
  const offer = { offer_id: "o", version: 1, terms_summary: "Fictional", fee_summary: "Fictional", valid_until: new Date(sys.clock.now().getTime() + 86400e3).toISOString(), documents: [{ document_id: doc.id, sha256: doc.sha256, title: "L" }] };
  ok(await avery.act(acts.engageAct(target, "engagement.offered", { offer }, { offer_digest: digestOf(offer) }, `/olip/v2/matters/${m.matter_id}/engagement-offers`)));
  const resp = await a.ai.prepareEngagementResponse(target.id, digestOf(offer)); await userApproves(sys, a.user, resp.approval);
  const e = obj(sys, target.id);
  ok(await avery.act(acts.engageAct(e, "engagement.firm_confirmed", {}, { offer_digest: e.acceptance.offer_digest, acceptance_id: e.acceptance.acceptance_id })));
  expectErr(await a.user.request("POST", `/olip/v2/matters/${m.matter_id}/events`, { event_type: "matter.closed" }), 403, "OLIP_FIRM_AUTHORITY_REQUIRED");
  ok(await avery.act({ event_type: "matter.terminated", matter_id: m.matter_id, object: { type: "matter", id: m.matter_id }, object_path: `/olip/v2/matters/${m.matter_id}`, post_path: `/olip/v2/matters/${m.matter_id}/events`, payload: { notice_text: "Fictional: we have ended our representation. Please see the notice letter." } }));
  assert.equal(obj(sys, target.id).state, "ended");
  expectErr(await a.ai.request("POST", `/olip/v2/threads/${t.id}/messages`, { body: "Fictional: one more thing" }), 409, "OLIP_THREAD_CLOSED");
  ok(await firmMsg(obj(sys, t.id), "Fictional: closing letter attached.", { category: "closing_communication", actor: "stf_test_avery" }));
  expectErr(await firmMsg(obj(sys, t.id), "Fictional: new advice", { actor: "stf_test_avery" }), 409, "OLIP_THREAD_CLOSED");
  expectErr(await a.ai.request("POST", `/olip/v2/matters/${m.matter_id}/threads`, { organization_id: "org_test_alvarez" }), 409, "OLIP_THREAD_CLOSED");
  const mm = (await a.ai.getMatter(m.matter_id)).matter;
  assert.equal(mm.state, "terminated");
});
