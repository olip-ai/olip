#!/usr/bin/env node
// Runs the full FICTIONAL OLIP 2.0-draft lifecycle twice: once with a self-hosted firm (direct) and once through an
// independent relay vendor (relay). Everything stays on loopback; nothing is sent to any real person or service.
import { startSystem } from "./system.mjs";
import { runScenarioA } from "./journey.mjs";
for (const topology of ["direct", "relay"]) {
  const sys = await startSystem({ topology, orgs: topology === "direct" ? ["org_test_alvarez"] : ["org_test_alvarez", "org_test_cedar", "org_test_northgate"] });
  console.log(`\n=== OLIP 2.0-draft fictional lifecycle, ${topology} topology (host ${sys.hostBase}) ===`);
  try { await runScenarioA(sys, { log: (l) => console.log(l) }); } finally { await sys.stop(); }
}
console.log("\nAll data above is fictional. OLIP 2.0 is a proposed draft, not an adopted standard.");
