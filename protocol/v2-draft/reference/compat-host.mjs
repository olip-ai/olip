// One address serving BOTH the unchanged OLIP 1.0 reference endpoint and the 2.0-draft lifecycle host.
// The 1.0 server code and files are used as they are (imported, not edited). Its manifest gains only one entry in
// extensions_supported, so 1.0 clients keep working and 2.0 clients can find the lifecycle profiles.
import { createServer } from "node:http";
import { createOlipServer } from "../../reference/server.mjs";
import { LIFECYCLE_EXTENSION } from "./lib/core.mjs";

const listen = (s) => new Promise((r) => s.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${s.address().port}`)));
export async function startCompatHost(v2system) {
  const v1 = createOlipServer({ mode: "mock" });
  const v1Base = await listen(v1.server);
  const isV2 = (p) => p.startsWith("/olip/v2/") || p === "/olip/v2" || p === "/.well-known/olip-lifecycle.json" || p.startsWith("/mock/v2/");
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    const p = new URL(req.url, "http://x").pathname;
    const target = isV2(p) ? v2system.hostBase : v1Base;
    const headers = { ...req.headers }; delete headers.host; delete headers["content-length"];
    const r = await fetch(target + req.url, { method: req.method, headers, body: raw.length ? raw : undefined, redirect: "manual" });
    let buf = Buffer.from(await r.arrayBuffer());
    if (p === "/.well-known/olip.json" && r.status === 200) {
      const m = JSON.parse(buf.toString("utf8"));
      m.extensions_supported = [...(m.extensions_supported || []), LIFECYCLE_EXTENSION];
      buf = Buffer.from(JSON.stringify(m));
    }
    const out = {}; r.headers.forEach((v, k) => { if (!["content-length", "content-encoding", "transfer-encoding", "connection"].includes(k)) out[k] = v; });
    res.writeHead(r.status, out).end(buf);
  });
  const base = await listen(server);
  return { base, v1Base, async stop() { await new Promise((r) => server.close(r)); await new Promise((r) => v1.server.close(r)); } };
}
