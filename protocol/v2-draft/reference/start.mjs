#!/usr/bin/env node
// Starts the FICTIONAL OLIP 2.0-draft reference system for local experiments: a lifecycle host, firm endpoints, and one
// address that serves both the unchanged OLIP 1.0 endpoint and the 2.0-draft lifecycle host. Loopback only; mock mode only.
//   node reference/start.mjs [--topology relay|direct]
import { startSystem } from "./system.mjs";
import { startCompatHost } from "./compat-host.mjs";
const t = process.argv.includes("--topology") ? process.argv[process.argv.indexOf("--topology") + 1] : "relay";
const sys = await startSystem({ topology: t, orgs: t === "direct" ? ["org_test_alvarez"] : undefined });
const compat = await startCompatHost(sys);
console.log(JSON.stringify({ statement: "FICTIONAL test system. Do not enter real client information.", topology: t, lifecycle_host: sys.hostBase, combined_1_0_and_2_0: compat.base, firm_endpoints: sys.firmBases,
  try: [`${compat.base}/.well-known/olip.json`, `${compat.base}/.well-known/olip-lifecycle.json`, `${compat.base}/olip/v2/recipients`] }, null, 2));
const stop = async () => { await compat.stop(); await sys.stop(); process.exit(0); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
