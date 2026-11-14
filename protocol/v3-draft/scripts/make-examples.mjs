// Writes FICTIONAL example documents to ../examples/: one valid response per published schema, captured from a real run of
// the reference journey, and labeled invalid variants that each break one rule. Run: node scripts/make-examples.mjs
// (tests/contract.test.mjs checks that every valid example passes and every invalid one fails its schema)
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { startV3System } from "../reference/system.mjs";
import { runJourney } from "../reference/journey.mjs";
import { ACTION_BY_ID } from "../reference/actions.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const portless = (v) => JSON.parse(JSON.stringify(v).replace(/127\.0\.0\.1:\d+/g, "127.0.0.1:8080"));
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const seen = {};
  const sys = await startV3System({ webhooks: { baseDelayMs: 5, maxAttempts: 2 }, observe: ({ actionId, status, body }) => { const n = status >= 400 ? "error" : ACTION_BY_ID[actionId]?.output; if (n && !seen[n]) seen[n] = body; } });
  const r = await runJourney(sys);
  await r.who.alpha.recipientPolicy("org_test_alvarez");
  await r.who.user.revokeCapsule(r.final_capsule.capsule_id);
  const op = await (await fetch(`${sys.base}/mock/v3/operator-token`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret: "test-only-operator-secret" }) })).json();
  await fetch(`${sys.base}/olip/v3/admin/jurisdiction-policy`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${op.operator_token}`, "idempotency-key": "example-policy-0001" }, body: JSON.stringify({ jurisdiction: "US-NY", status: "suspended" }) });
  seen["workflow-event"] = r.events[0];
  seen.webhook = [...sys.layer.store.webhooks.values()][0]?.body;
  seen["context-capsule"] = r.final_capsule;
  await sys.stop();
  rmSync(join(root, "examples"), { recursive: true, force: true });
  mkdirSync(join(root, "examples", "valid"), { recursive: true }); mkdirSync(join(root, "examples", "invalid"), { recursive: true });
  const index = [];
  for (const [n, body] of Object.entries(seen).sort()) { if (!body) continue; writeFileSync(join(root, "examples", "valid", `${n}.json`), JSON.stringify(portless(body), null, 2) + "\n"); index.push({ file: `valid/${n}.json`, schema: n, valid: true }); }
  const bad = {
    "manifest-approval-model-callable": ["agent-manifest", (m) => ({ ...m, approval: { ...m.approval, approval_is_model_callable: true } })],
    "manifest-paid-influence": ["agent-manifest", (m) => ({ ...m, neutrality: { ...m.neutrality, paid_influence: true } })],
    "manifest-stable-release-claim": ["agent-manifest", (m) => ({ ...m, release_status: "stable" })],
    "plan-claims-authorization": ["next-actions-plan", (p) => ({ ...p, not_authorization: false })],
    "plan-unknown-disposition": ["next-actions-plan", (p) => ({ ...p, next_actions: [{ ...p.next_actions[0], disposition: "approved" }] })],
    "capsule-authorizes-recipient": ["context-capsule", (c) => ({ ...c, export_authorization: { ...c.export_authorization, authorizes_recipients: ["org_test_cedar"] } })],
    "capsule-content-and-sealed": ["context-capsule", (c) => ({ ...c, sealed_content: { alg: "ECDH-ES+HKDF-SHA256/A256GCM", recipient_kid: "k", epk: { kty: "OKP", crv: "X25519", x: "x" }, iv: "i", tag: "t", aad: "a", ciphertext: "c" } })],
    "capsule-unknown-origin-type": ["context-capsule", (c) => ({ ...c, content: { ...c.content, assertions: [{ ...c.content.assertions[0], origin_type: "verified_fact" }] } })],
    "capsule-document-content-included": ["context-capsule", (c) => ({ ...c, content: { ...c.content, document_refs: [{ document_id: "doc_1", sha256: "sha256:" + "0".repeat(64), access_scope: "x", content_included: true }] } })],
    "event-bad-digest": ["workflow-event", (e) => ({ ...e, event_digest: "md5:abc" })],
    "event-unknown-actor": ["workflow-event", (e) => ({ ...e, actor_type: "model" })],
    "import-creates-grants": ["capsule-import", (i) => ({ ...i, grants_created: 1 })],
    "error-unknown-code": ["error", (e) => ({ ...e, error: { ...e.error, code: "OOPS" } })],
    "preview-claims-sent": ["disclosure-preview", (d) => ({ ...d, sent: true })],
  };
  for (const [name, [schema, f]] of Object.entries(bad)) { if (!seen[schema]) continue; writeFileSync(join(root, "examples", "invalid", `${name}.json`), JSON.stringify(portless(f(structuredClone(seen[schema]))), null, 2) + "\n"); index.push({ file: `invalid/${name}.json`, schema, valid: false }); }
  writeFileSync(join(root, "examples", "index.json"), JSON.stringify({ olip_version: "3.0-draft.1", fictional: true, statement: "FICTIONAL examples captured from the reference journey. Not real people, firms or matters.", examples: index }, null, 2) + "\n");
  console.log(`wrote ${index.length} examples`);
}
