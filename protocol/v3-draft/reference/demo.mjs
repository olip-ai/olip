#!/usr/bin/env node
// Runs the FICTIONAL OLIP 3.0-draft reference journey end to end and prints each step in plain English.
//   node reference/demo.mjs
import { startV3System } from "./system.mjs";
import { runJourney } from "./journey.mjs";
console.log("OLIP 3.0-draft reference journey. PROPOSED DRAFT, FICTIONAL DATA ONLY. Nothing here is sent to any real person or firm.\n");
const sys = await startV3System({ webhooks: { baseDelayMs: 10, maxAttempts: 3 } });
try { await runJourney(sys, { log: (l) => console.log(l) }); } finally { await sys.stop(); }
