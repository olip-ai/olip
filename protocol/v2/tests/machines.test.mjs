// Property tests over the five lifecycle state machines: structure, reachability, authority rules, and
// exhaustive checking that every (event, state) pair outside the table is refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { MACHINES, transitionFor, isTerminal } from "../reference/lib/core.mjs";

const names = Object.keys(MACHINES);
test("five machines; event types unique within a machine; every from/to state exists", () => {
  assert.deepEqual(names.sort(), ["consultation", "engagement", "intake", "matter", "message_delivery"]);
  for (const n of names) {
    const m = MACHINES[n]; const types = m.transitions.map((t) => t.event_type);
    assert.equal(new Set(types).size, types.length, n);
    assert.ok(m.states[m.initial], `${n} initial`);
    for (const t of m.transitions) { assert.ok(m.states[t.to], `${n} ${t.event_type} to`); for (const f of t.from) assert.ok(m.states[f], `${n} ${t.event_type} from ${f}`); assert.ok(t.event_type.startsWith(`${n === "message_delivery" ? "message" : n}.`), t.event_type); }
  }
});
test("terminal states have no way out, and every state is reachable from the initial state", () => {
  for (const n of names) {
    const m = MACHINES[n];
    for (const [s, d] of Object.entries(m.states)) if (d.terminal) assert.ok(!m.transitions.some((t) => t.from.includes(s)), `${n}: terminal ${s} has an outgoing transition`);
    const seen = new Set([m.initial]); let grew = true;
    while (grew) { grew = false; for (const t of m.transitions) if (t.from.some((f) => seen.has(f)) && !seen.has(t.to)) { seen.add(t.to); grew = true; } }
    assert.deepEqual([...seen].sort(), Object.keys(m.states).sort(), `${n}: unreachable states`);
  }
});
test("exhaustive: transitionFor accepts exactly the table, for every event type and every state", () => {
  let checked = 0;
  for (const n of names) {
    const m = MACHINES[n];
    for (const t of m.transitions) for (const s of Object.keys(m.states)) {
      const r = transitionFor(n, t.event_type, s); checked++;
      if (t.from.includes(s)) { assert.equal(r.ok, true); assert.equal(r.to, t.to); } else { assert.equal(r.ok, false); assert.equal(r.code, "OLIP_LIFECYCLE_TRANSITION_INVALID"); }
    }
    assert.equal(transitionFor(n, `${n}.made_up_event`, m.initial).ok, false);
    for (const s of Object.keys(m.states)) assert.equal(isTerminal(n, s), !!m.states[s].terminal);
  }
  assert.ok(checked > 200, String(checked));
});
test("authority (INV-01, INV-02, INV-10): firm-only claims are firm-only; payment never moves an engagement", () => {
  const actorsOf = (n, e) => MACHINES[n].transitions.find((t) => t.event_type === e)?.actors;
  assert.deepEqual(actorsOf("engagement", "engagement.firm_confirmed"), ["firm"]);
  assert.deepEqual(actorsOf("consultation", "consultation.confirmed"), ["firm"]);
  for (const e of ["consultation.completed", "consultation.no_show"]) assert.deepEqual(actorsOf("consultation", e), ["firm"]);
  for (const e of ["intake.eligible_for_further_intake", "intake.unable_to_proceed", "intake.information_requested"]) assert.deepEqual(actorsOf("intake", e), ["firm"]);
  assert.deepEqual(actorsOf("message_delivery", "message.delivered_to_endpoint"), ["lifecycle_host"], "delivery is recorded by the host only on a signed receipt");
  assert.ok(!MACHINES.engagement.transitions.some((t) => /payment/.test(t.event_type)), "payment is not a transition");
  for (const n of names) for (const t of MACHINES[n].transitions) assert.ok(!t.actors.includes("agent") && !t.actors.includes("agent_client"), `${t.event_type}: agents never record lifecycle events`);
  assert.ok(MACHINES.engagement.transitions.filter((t) => t.to === "firm_confirmed").every((t) => t.from.every((f) => f === "user_accepted")), "firm confirmation only follows a user acceptance");
});
test("random walks: 5,000 steps per machine never leave the table, never leave a terminal state", () => {
  let seed = 20261114; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (const n of names) {
    const m = MACHINES[n]; let s = m.initial; const types = m.transitions.map((t) => t.event_type);
    for (let i = 0; i < 5000; i++) {
      const e = types[Math.floor(rnd() * types.length)]; const r = transitionFor(n, e, s);
      if (m.states[s].terminal) assert.equal(r.ok, false);
      if (r.ok) s = r.to;
      if (m.states[s].terminal && rnd() < 0.2) s = m.initial;
    }
  }
});
