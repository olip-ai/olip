// Starts a complete FICTIONAL OLIP 2.0-draft system on loopback HTTP: one lifecycle host plus firm-owned endpoints.
//   topology "relay":  an independent vendor (Neutral Relay Co., fictional) runs the host; each firm runs its own endpoint on its own port.
//                      The host reaches firms over HTTP and counts delivery only on the firm's signed receipt.
//   topology "direct": the firm runs the host itself (self-hosted). Host and firm endpoint are two components of one organization,
//                      connected in-process. The firm's endpoint still signs receipts and events with its own keys.
import { createLifecycleHost, createClock } from "./lifecycle-host.mjs";
import { createFirmEndpoint } from "./firm-endpoint.mjs";
import { FIRMS } from "./fixtures.mjs";

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
export const httpTransport = (base) => ({
  base,
  async call(method, path, body, headers = {}) {
    const r = await fetch(base + path, { method, headers: { ...(body != null ? { "content-type": "application/json" } : {}), ...headers }, body: body != null ? JSON.stringify(body) : undefined });
    const text = await r.text(); let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: r.status, body: parsed, headers: Object.fromEntries(r.headers) };
  },
});
// A relay that stores messages for an offline firm: it accepts (202) but cannot produce the firm's receipt.
const offlineInbox = (inner, isOffline) => ({ call: (method, path, body, headers) => (isOffline() && method === "POST" && path === "/firm/v2/inbox" ? Promise.resolve({ status: 202, body: { accepted: true } }) : inner.call(method, path, body, headers)) });

export async function startSystem({ topology = "relay", orgs = ["org_test_alvarez", "org_test_cedar", "org_test_northgate"], mode = "mock", offline = [], allowLoopbackCallbacksForTests = true, rateLimitPerToken, clock = createClock(), hostLabel, observe } = {}) {
  if (topology === "direct" && orgs.length !== 1) throw new Error("direct topology: one self-hosting firm per host");
  const firmEps = {}, firmBases = {}, offlineSet = new Set(offline);
  const transports = [];
  let hostRef = null;
  // In-process calls get a serialized copy, exactly as they would over HTTP, so no caller holds live host state.
  const hostInProcess = { call: async (method, path, body, headers) => { const r = await hostRef.handle(method, path, headers, body == null ? null : structuredClone(body)); return { ...r, body: r.body == null ? null : JSON.parse(JSON.stringify(r.body)) }; } };
  let hostBase = null;
  const hostHttp = { call: (...a) => httpTransport(hostBase).call(...a) };
  for (const id of orgs) {
    const ep = createFirmEndpoint({ firm: FIRMS[id], clock, host: topology === "direct" ? hostInProcess : hostHttp });
    firmEps[id] = ep;
    let t;
    if (topology === "direct") t = { call: (method, path, body, headers) => ep.handle(method, path, headers || {}, body) };
    else { firmBases[id] = await listen(ep.server); t = httpTransport(firmBases[id]); }
    transports.push({ organization_id: id, transport: offlineInbox(t, () => offlineSet.has(id)) });
  }
  const host = createLifecycleHost({ mode, topology, clock, firms: transports, allowLoopbackCallbacksForTests, rateLimitPerToken, hostLabel, observe });
  hostRef = host;
  hostBase = await listen(host.server);
  return {
    topology, host, hostBase, firms: firmEps, firmBases, clock, offline: offlineSet,
    async stop() { await new Promise((r) => host.server.close(r)); for (const id of Object.keys(firmBases)) await new Promise((r) => firmEps[id].server.close(r)); },
  };
}
