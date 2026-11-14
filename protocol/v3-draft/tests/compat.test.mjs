// Backward compatibility and neutrality. The 45 frozen OLIP 1.0 files are byte-for-byte unchanged; no 2.0 source
// file changed; the 3.0-draft folder names no sponsor product and needs no sponsor service; 3.0 identifiers never claim
// a stable "3.0" release.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const V3DIR = join(here, "..");
const PROTOCOL = join(V3DIR, "..");
const REPO = join(PROTOCOL, "..");
const MANIFEST = join(PROTOCOL, "v2", "compat", "OLIP-1.0-SHA256SUMS.txt");
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); if (["node_modules", "dist", "__pycache__", "results"].includes(f)) return []; return statSync(p).isDirectory() ? walk(p) : [p]; });

test("the freeze list is the published one, and all 45 frozen OLIP 1.0 files are byte-for-byte unchanged", () => {
  const list = readFileSync(MANIFEST);
  assert.equal(createHash("sha256").update(list).digest("hex"), "b1e7339790ae0fc0a1f1029ec13f2a1137e89dec98ee9f1064bc3f6da6c7fb80", "published SHA-256 of the freeze list");
  const lines = list.toString("utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  assert.equal(lines.length, 45);
  for (const l of lines) { const [h, f] = l.split(/\s+/); assert.equal(createHash("sha256").update(readFileSync(join(PROTOCOL, f))).digest("hex"), h, f); }
});
test("no 2.0 source file differs from the committed version (test outputs excluded)", (t) => {
  const r = spawnSync("git", ["-C", REPO, "diff", "--name-only", "HEAD", "--", "protocol/v2", ":(exclude)protocol/v2/conformance/results"], { encoding: "utf8" });
  if (r.status !== 0) return t.skip("git not available in this checkout");
  assert.equal(r.stdout.trim(), "", "2.0 files must not change");
  const u = spawnSync("git", ["-C", REPO, "ls-files", "--others", "--exclude-standard", "--", "protocol/v2"], { encoding: "utf8" });
  assert.equal(u.stdout.trim(), "", "no new files inside the 2.0 folder");
});
test("the 3.0-draft folder is provider-neutral: no sponsor product, account or service is named or needed", () => {
  const files = walk(V3DIR).filter((f) => /\.(mjs|ts|py|json|md|yml)$/.test(f) && !f.endsWith("package-lock.json") && !f.endsWith("compat.test.mjs"));
  assert.ok(files.length > 30);
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    assert.ok(!/esq\s?copilot|esq\s?harness|matching engine/i.test(text), `${relative(V3DIR, f)} names a sponsor product`);
  }
  const pkg = JSON.parse(readFileSync(join(V3DIR, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), [], "no runtime dependencies; SDKs are pinned dev dependencies");
  for (const v of Object.values(pkg.devDependencies)) assert.match(v, /^\d+\.\d+\.\d+$/, "exact pins only");
});
test("3.0 identifiers are draft identifiers only; nothing claims a stable 3.0 release, adoption, certification or audit", async () => {
  const core = await import("../reference/lib/core.mjs");
  assert.equal(core.V3, "3.0-draft.1"); assert.equal(core.RELEASE_STATUS, "proposed_draft_not_adopted");
  assert.match(core.V3_EXTENSION, /3\.0-draft$/);
  const pkg = JSON.parse(readFileSync(join(V3DIR, "package.json"), "utf8")); assert.match(pkg.version, /-draft\./);
  for (const f of walk(join(V3DIR, "schemas"))) assert.match(JSON.parse(readFileSync(f, "utf8")).$id, /^https:\/\/olip\.ai\/spec\/3\.0-draft\/schemas\//, f);
  const texts = walk(V3DIR).filter((f) => /\.(mjs|ts|py|md)$/.test(f) && !/tests[\\/]/.test(f)).map((f) => [relative(V3DIR, f), readFileSync(f, "utf8")]);
  for (const [f, t] of texts) {
    assert.ok(!/\b(is|was|has been) (independently )?(security[- ])?(audited|certified|adopted)\b/i.test(t.replace(/\b(not|never|no)\b[^.]{0,80}/gi, "")), `${f} claims adoption, certification or audit`);
  }
});
