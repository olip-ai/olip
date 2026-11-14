// OLIP 3.0-draft durable store. PROPOSED, NOT ADOPTED. Reference quality, single process.
// Keeps workflows, the signed event journal, idempotency records, disclosures, capsules, import authorizations,
// subscriptions and the audit log. With a file path it writes an atomic snapshot after every committed change
// (write to a temporary file, then rename), so a restarted host resumes with the same ids, cursors and idempotency
// results. It stores no CaseBrief content: case content stays sealed in the 2.0 host.
// Not a production database: no multi-process locking, no encryption of the snapshot file, no replication.
import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";

const TABLES = ["workflows", "journals", "idempotency", "disclosures", "capsules", "importAuthorizations", "imports", "subscriptions", "webhooks", "audit", "usedNonces"];

export function createStore({ path = null } = {}) {
  const S = Object.fromEntries(TABLES.map((t) => [t, new Map()]));
  let commits = 0;
  if (path && existsSync(path)) {
    const snap = JSON.parse(readFileSync(path, "utf8"));
    for (const t of TABLES) for (const [k, v] of snap[t] || []) S[t].set(k, v);
    commits = snap.commits || 0;
  }
  function commit() {
    commits++;
    if (!path) return;
    const snap = { format: "olip-3.0-draft-store/1", commits, ...Object.fromEntries(TABLES.map((t) => [t, [...S[t].entries()]])) };
    const tmp = `${path}.tmp-${process.pid}`;
    writeFileSync(tmp, JSON.stringify(snap));
    renameSync(tmp, path);
  }
  return { ...S, commit, get commits() { return commits; }, path };
}
