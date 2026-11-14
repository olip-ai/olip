"""Drives a live OLIP 3.0-draft host with the Python client (fictional sandbox only).

    python3 journey_check.py <base_url> <agent_token>

Prints one JSON line: {ok, steps, details}. It verifies the signed manifest, lists organizations, starts a workflow,
prepares a disclosure, confirms that sending before the user approves is refused, asks the planner, and resumes the
event journal with chain and signature checks. It never approves anything (it cannot).
"""
import json
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
import olip_agent as o  # noqa: E402

base, token = sys.argv[1], sys.argv[2]
c = o.AgentClient(base, token)
steps, details = [], []


def step(name, cond, info=None):
    steps.append({"step": name, "ok": bool(cond)})
    if not cond:
        details.append({"step": name, "info": info})


man = c.manifest()
keys = c.keys()
step("manifest_signature", o.verify_detached(man, keys)["ok"])
step("manifest_not_adopted", man.get("release_status") == "proposed_draft_not_adopted")
pros = c.invoke("olip.find_professionals", {"jurisdiction": "US-CA"})
step("unpaid_listing", pros["ordering"]["paid_influence"] is False)
casebrief = {"prospective_client": {"name": "Python Tester (fictional)", "contact": "py@client.example.test"}, "adverse_parties": ["Example Landlord LLC (fictional)"],
             "matter": {"category": "housing.landlord_tenant", "jurisdiction": "US-CA"}, "facts": {"summary": "Fictional.", "key_dates": []}, "goals": "Fictional."}
wf = c.invoke("olip.start_workflow", {"casebrief": casebrief, "fictional": True})["workflow"]
pv = c.invoke("olip.preview_disclosure", {"workflow_id": wf["workflow_id"], "organization_id": "org_test_alvarez", "stage": "screening",
                                          "fields": ["prospective_client.name", "adverse_parties", "matter.category", "matter.jurisdiction"]})["disclosure"]
step("preview_not_sent", pv["state"] == "awaiting_user_approval")
try:
    c.invoke("olip.submit_approved_disclosure", {"disclosure_id": pv["disclosure_id"], "grant_id": pv["approval"]["grant_id"], "grant_digest": pv["approval"]["grant_digest"]})
    step("send_needs_user_approval", False, "sent without approval")
except o.OlipError as e:
    step("send_needs_user_approval", e.code == "USER_APPROVAL_REQUIRED", e.code)
plan = c.plan(wf["workflow_id"], "share_screening")
step("plan_is_not_authorization", plan["not_authorization"] is True and plan["not_legal_advice"] is True)
r = c.resume(wf["workflow_id"])
step("journal_verifies", len(r["entries"]) >= 2 and r["last_digest"] == r["entries"][-1]["event_digest"])
print(json.dumps({"ok": not details, "steps": steps, "details": details}))
sys.exit(0 if not details else 1)
