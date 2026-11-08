// Runs the conformance suite against both implementations and the 2 x 2 agent/endpoint interop matrix.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { startServer, run, ROOT } from "./helpers.mjs";

const servers = {};
test("start both endpoints", async () => { servers.node = await startServer("node", 18787); servers.python = await startServer("python", 18788); });
for (const kind of ["node", "python"]) {
  test(`conformance suite passes on the ${kind} endpoint`, async () => {
    const r = await run("node", ["conformance/run.mjs", "--base", servers[kind].base, "--label", `${kind}-endpoint`, "--json", `conformance/results/${kind}-endpoint.json`]);
    const s = JSON.parse(readFileSync(`${ROOT}/conformance/results/${kind}-endpoint.json`, "utf8"));
    assert.equal(s.fail, 0, r.out);
    assert.ok(s.pass >= 29, `only ${s.pass} passed`);
  });
  test(`Node agent completes a fictional handoff on the ${kind} endpoint`, async () => {
    const r = await run("node", ["reference/demo.mjs", servers[kind].base]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /State: delivered/); assert.match(r.out, /check: valid/); assert.match(r.out, /replay=true, same id=true/);
  });
  test(`Python agent completes a fictional handoff on the ${kind} endpoint`, async () => {
    const r = await run("python3", ["alt-python/olip_client.py", servers[kind].base]);
    assert.equal(r.code, 0, r.out + r.err);
    assert.equal(JSON.parse(r.out).ok, true);
  });
}
test("MCP adapter lists tools without an approve tool and calls a live endpoint", async () => {
  const input = [{ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "olip_discover_providers", arguments: { matter: "housing.landlord_tenant" } } }].map((x) => JSON.stringify(x)).join("\n") + "\n";
  const r = await run("node", ["reference/mcp-adapter.mjs"], { env: { ...process.env, OLIP_BASE: servers.python.base }, input });
  const lines = r.out.trim().split("\n").map((l) => JSON.parse(l));
  const tools = lines.find((l) => l.id === 2).result.tools.map((t) => t.name);
  assert.ok(tools.includes("olip_submit_approved_handoff"));
  assert.ok(!tools.some((t) => /approve(?!d)/.test(t)), "no tool lets the agent approve");
  const call = lines.find((l) => l.id === 3).result;
  assert.equal(call.isError, false); assert.ok(call.structuredContent.results.length >= 1);
});
test("stop endpoints", () => { servers.node.stop(); servers.python.stop(); });
