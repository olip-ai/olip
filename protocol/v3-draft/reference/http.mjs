// OLIP 3.0-draft HTTPS binding: the neutral reference contract. PROPOSED, NOT ADOPTED.
// Every route below is a thin mapping onto layer.invoke(); there is no logic here that MCP or A2A callers skip.
// Paths that are not 3.0-draft paths go to the co-located, unchanged 2.0 lifecycle host.
import { createServer } from "node:http";
import { V3 } from "./lib/core.mjs";
import { errorBody, ERRORS } from "./lib/errors.mjs";
import { ACTIONS, ACTION_BY_ID, contractOf } from "./actions.mjs";
import { SCHEMAS, INPUT_SCHEMAS } from "./schemas.mjs";
import { buildOpenApi } from "./openapi.mjs";
import { ROUTES } from "./routes.mjs";

const MAX_JSON_BYTES = 1_000_000;
export function createHttpBinding({ layer, v2 }) {
  const json = (status, body, headers = {}) => ({ status, body, headers });
  async function handle(method, rawPath, headers = {}, body = null) {
    const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
    const url = new URL(rawPath, "http://host.local");
    const p = url.pathname;
    if (!(p.startsWith("/olip/v3/") || p === "/.well-known/olip-agent.json" || p.startsWith("/mock/v3/"))) {
      const r = await v2.handle(method, rawPath, headers, body);
      if (method !== "GET") layer.syncAll(); // keep workflow journals and webhooks current after 2.0 writes
      return r;
    }
    if (h["olip-version"] && h["olip-version"] !== V3) return json(400, errorBody("VERSION_UNSUPPORTED", `This binding speaks ${V3}. Use /olip/v2 for 2.0.`, { details: { supported: [V3] } }));
    // Static, public contract documents.
    if (method === "GET" && p === "/olip/v3/actions") return json(200, { olip_version: V3, actions: ACTIONS.map(contractOf) }, { "cache-control": "public, max-age=300" });
    if (method === "GET" && p.startsWith("/olip/v3/actions/") && ACTION_BY_ID[decodeURIComponent(p.slice(17))]) return json(200, { olip_version: V3, action: contractOf(ACTION_BY_ID[decodeURIComponent(p.slice(17))]) });
    if (method === "GET" && p === "/olip/v3/keys") return json(200, { olip_version: V3, keys: layer.jwks() }, { "cache-control": "public, max-age=300" });
    if (method === "GET" && p === "/olip/v3/errors") return json(200, { olip_version: V3, errors: Object.values(ERRORS) });
    if (method === "GET" && p === "/olip/v3/openapi.json") return json(200, buildOpenApi());
    if (method === "GET" && p.startsWith("/olip/v3/schemas/")) {
      const name = decodeURIComponent(p.slice(17));
      const s = name.startsWith("actions/") ? INPUT_SCHEMAS[name.slice(8).replace(/\.input\.json$/, "")] : SCHEMAS[name.replace(/\.schema\.json$/, "")];
      return s ? json(200, s, { "cache-control": "public, max-age=300" }) : json(404, errorBody("NOT_FOUND"));
    }
    if (layer.mode === "mock" && p === "/mock/v3/operator-token" && method === "POST") { const t = layer.issueOperatorToken(body?.secret); return t ? json(201, { olip_version: V3, operator_token: t, expires_in: 600, note: "Test build only." }) : json(401, errorBody("AUTH_REQUIRED")); }
    if (layer.mode === "mock" && p === "/mock/v3/webhooks" && method === "GET") return json(200, { olip_version: V3, webhooks: [...layer.store.webhooks.values()] });
    if (layer.mode === "mock" && p === "/mock/v3/audit" && method === "GET") return json(200, { olip_version: V3, audit: [...layer.store.audit.values()] });
    const rt = ROUTES.find((r) => r.method === method && r.re.test(p));
    if (!rt) return json(404, errorBody("ACTION_NOT_SUPPORTED", "Unknown 3.0-draft route."));
    const prm = Object.fromEntries(rt.keys.map((k, i) => [k, decodeURIComponent(p.match(rt.re)[i + 1])]));
    const actionId = rt.actionId ?? prm.action_id;
    const input = rt.input(prm, body ?? {}, url.searchParams) ?? {};
    const r = await layer.invoke({ headers: h, actionId, input, binding: "https", idempotencyKey: h["idempotency-key"] ?? null, correlationId: h["x-correlation-id"] ?? null });
    if (r.status === 200 && rt.actionId === "olip.get_capabilities") r.headers = { ...r.headers, etag: `"${r.body.etag}"`, "cache-control": "public, max-age=300" };
    return r;
  }
  const server = createServer(async (req, res) => {
    let size = 0; const chunks = [];
    for await (const c of req) { size += c.length; if (size > MAX_JSON_BYTES) { res.writeHead(413, { "content-type": "application/json" }).end(JSON.stringify(errorBody("SCHEMA_INVALID", "Request too large."))); req.destroy(); return; } chunks.push(c); }
    const raw = Buffer.concat(chunks).toString("utf8");
    let body = null;
    if (raw) { try { body = String(req.headers["content-type"] || "").includes("application/x-www-form-urlencoded") ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw); } catch { res.writeHead(400, { "content-type": "application/json" }).end(JSON.stringify(errorBody("SCHEMA_INVALID", "Body must be JSON."))); return; } }
    const r = await handle(req.method, req.url, req.headers, body);
    const sec = { "x-content-type-options": "nosniff", "referrer-policy": "no-referrer", "cache-control": "no-store" };
    if (r.raw) { res.writeHead(r.status, { ...sec, ...r.headers }).end(r.raw); return; }
    if (r.html) { res.writeHead(r.status, { ...sec, "content-type": "text/html; charset=utf-8", "x-frame-options": "DENY", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" }).end(r.html); return; }
    res.writeHead(r.status, { ...sec, "content-type": "application/json", ...(r.headers || {}) }).end(JSON.stringify(r.body));
  });
  return { handle, server };
}
