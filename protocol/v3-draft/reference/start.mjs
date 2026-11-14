#!/usr/bin/env node
// Starts the FICTIONAL OLIP 3.0-draft sandbox on loopback: the unchanged 2.0 lifecycle system plus the 3.0-draft
// agent layer on one address, and prints a fictional assistant token so any agent can try it. Mock mode only.
//   node reference/start.mjs          (stop with Ctrl+C)
import { startV3System } from "./system.mjs";
import { people } from "./journey.mjs";
const sys = await startV3System();
const who = await people(sys);
console.log(JSON.stringify({ statement: "FICTIONAL test sandbox for a proposed draft. Do not enter real client information. Tokens expire after 15 minutes of host time.",
  base: sys.base, agent_token: who.alpha.token, user_token: who.user.token, user: "usr_test_casey (fictional)",
  try: [`${sys.base}/.well-known/olip-agent.json`, `${sys.base}/olip/v3/actions`, `${sys.base}/olip/v3/openapi.json`, `${sys.base}/olip/v3/professionals?jurisdiction=US-CA`],
  mcp: "OLIP_V3_BASE=<base> OLIP_V3_AGENT_TOKEN=<agent_token> node adapters/mcp/stdio.mjs", approvals: `${sys.base}/mock/v2/outbox (the fictional user's inbox with one-time codes)` }, null, 2));
const stop = async () => { await sys.stop(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
