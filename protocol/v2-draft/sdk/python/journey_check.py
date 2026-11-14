"""Drives the assistant side of a FICTIONAL OLIP 2.0-draft journey from Python against a running host (mock mode).
Usage: python3 journey_check.py <host base URL>. Prints one JSON line of results. Fictional data only."""
import json
import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import olip_lifecycle as o  # noqa: E402

base = sys.argv[1]
out = {}
user, ai = o.LifecycleClient(base), o.LifecycleClient(base)
out["negotiated"] = user.negotiate()["lifecycle"] and ai.negotiate()["lifecycle"]
user.user_session("usr_test_morgan", "test-only-morgan")
d = user.delegate_agent("agt_test_assistant_b", content_access=True)
ai.agent_token("agt_test_assistant_b", "test-only-agent-b-secret", d["delegation_code"])
cb = {"prospective_client": {"name": "Morgan Lee (fictional)", "contact": "morgan@client.example.test"}, "adverse_parties": ["Harbor View Apartments LLC (fictional)"],
      "matter": {"category": "housing.landlord_tenant", "jurisdiction": "US-CA"}, "facts": {"summary": "Fictional: repairs not made.", "key_dates": []}, "goals": "Get repairs done."}
m = ai.create_matter(cb)["matter"]
req = ai.request_conflict_screen(m["matter_id"], "org_test_cedar", ["prospective_client.name", "adverse_parties", "matter.category", "matter.jurisdiction"])
ap = req["approval"]
try:
    ai.decide(ap["approval_id"], "approve", "000000", ap["grant_digest"])
    out["agent_could_approve"] = True
except o.OlipError as e:
    out["agent_could_approve"] = False
    out["agent_approve_error"] = e.code
try:
    ai.submit_conflict_screen(req["conflict_screen"]["id"], ap)
    out["sent_before_user_approved"] = True
except o.OlipError as e:
    out["sent_before_user_approved"] = False
    out["early_submit_error"] = e.code
view = user.get_approval(ap["approval_id"])["approval"]
out["preview_recipient"] = view["preview"]["recipient"]["organization_id"]
out["preview_digest_matches"] = view["grant_digest"] == ap["grant_digest"]
with urllib.request.urlopen(base + "/mock/v2/outbox") as r:  # the user's own inbox in the mock
    code = [x for x in json.loads(r.read())["messages"] if x["approval_id"] == ap["approval_id"]][-1]["code"]
user.decide(ap["approval_id"], "approve", code, ap["grant_digest"])
sent = ai.submit_conflict_screen(req["conflict_screen"]["id"], ap)
out["delivery_state"] = sent["delivery"]["state"]
out["screen_state"] = sent["conflict_screen"]["state"]
ev = ai.events(m["matter_id"])["entries"]
out["journal_ok"] = o.verify_journal(ev)["ok"]
hk = ai.host_keys()
out["host_events_verify"] = all(o.verify_detached(e["event"], hk)["ok"] for e in ev if e["event"]["actor"]["role"] != "firm")
p = user.export_passport(m["matter_id"])["passport"]
out["passport_signature_ok"] = o.verify_detached(p, hk)["ok"]
out["passport_transmitted"] = p["transmitted"]
print(json.dumps(out))
