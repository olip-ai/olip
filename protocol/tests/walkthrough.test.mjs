// The public quickstart walkthrough (success, failure and withdrawal paths, schema-checked) must pass on both endpoints.
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer, run } from "./helpers.mjs";

for (const [kind, port] of [["node", 18797], ["python", 18798]]) {
  test(`quickstart walkthrough passes on the ${kind} endpoint`, async () => {
    const s = await startServer(kind, port);
    try {
      const r = await run("node", ["reference/walkthrough.mjs", s.base]);
      assert.equal(r.code, 0, r.out + r.err);
      assert.match(r.out, /Walkthrough complete/);
      assert.doesNotMatch(r.out, /: INVALID |UNEXPECTED:/);
      assert.match(r.out, /SANDBOX SIMULATION/);
    } finally { s.stop(); }
  });
}
