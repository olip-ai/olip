// Starts a complete FICTIONAL OLIP 3.0-draft system on loopback HTTP:
//   * the unchanged 2.0 system (lifecycle host plus firm-owned endpoints), started with its own starter,
//   * the 3.0-draft agent layer, co-located with that host and served on one origin that answers /olip/v3/* itself
//     and passes every other path to the 2.0 host unchanged.
import { startSystem as startV2 } from "../../v2/reference/system.mjs";
import { createAgentLayer } from "./agent-layer.mjs";
import { createHttpBinding } from "./http.mjs";

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
export const httpTransport = (base) => ({
  base,
  async call(method, path, body, headers = {}) {
    const r = await fetch(base + path, { method, headers: { ...(body != null ? { "content-type": "application/json" } : {}), ...headers }, body: body != null ? JSON.stringify(body) : undefined });
    const text = await r.text(); let parsed = null; try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    return { status: r.status, body: parsed, headers: Object.fromEntries(r.headers) };
  },
});

export async function startV3System({ topology = "relay", orgs, mode = "mock", storePath = null, hostLabel = "v3-host", webhooks, allowLoopbackCallbacksForTests = true, observe, v2observe, policyOverrides, existingV2 } = {}) {
  // The 2.0 system calls back after each of its writes (including firm events that reach it directly), so the current
  // 3.0 layer mirrors lifecycle events promptly. A restarted layer takes over this hook from the stopped one.
  const v2 = existingV2 || await startV2({ topology, orgs, mode, allowLoopbackCallbacksForTests, observe: (ev) => { v2observe?.(ev); if (ev.method !== "GET") v2.v3Layer?.syncAll(); } });
  const layer = createAgentLayer({ v2: v2.host, mode, clock: v2.clock, storePath, hostLabel, webhooks, allowLoopbackCallbacksForTests, policyOverrides, observe });
  v2.v3Layer = layer;
  const http = createHttpBinding({ layer, v2: v2.host });
  const base = await listen(http.server);
  return {
    v2, layer, http, base, clock: v2.clock, firms: v2.firms, hostBase: base,
    // Stops only the 3.0 layer (the 2.0 system keeps running), to prove a restarted layer resumes from its store.
    async stopLayer() { layer.close(); await new Promise((r) => { http.server.closeAllConnections?.(); http.server.close(r); }); },
    async stop() { layer.close(); await new Promise((r) => { http.server.closeAllConnections?.(); http.server.close(r); }); if (!existingV2) await v2.stop(); },
  };
}
