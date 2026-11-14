"""Checks vectors/v3-vectors.json with the Python implementation. Prints one JSON line: {checked, failed, skipped, details}."""
import json
import os
import sys

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
import olip_agent as o  # noqa: E402

V = json.load(open(os.path.join(here, "..", "..", "vectors", "v3-vectors.json"), encoding="utf-8"))
checked = failed = skipped = 0
details = []


def check(name, cond):
    global checked, failed
    checked += 1
    if not cond:
        failed += 1
        details.append(name)


for c in V["canonical"]:
    check("canonical", o.canonicalize(c["input"]) == c["canonical"])
    check("canonical_digest", o.digest_of(c["input"]) == c["digest"])
keys = [V["keys"]["events"]]
check("journal_chain_and_signatures", o.verify_journal(V["journal"], keys)["ok"])
broken = [dict(e) for e in V["journal"]]
broken[1] = {**broken[1], "payload": {"n": 99}}
check("journal_tamper_detected", not o.verify_journal(broken, keys)["ok"])
cap = V["capsule"]
body = {k: v for k, v in cap.items() if k not in ("signature", "capsule_digest")}
check("capsule_digest", o.digest_of(body) == cap["capsule_digest"])
check("capsule_signature", o.verify_detached(cap, [V["keys"]["capsules"]])["ok"])
check("webhook_signature", o.verify_detached(V["webhook"], keys)["ok"])
plan = {k: v for k, v in V["plan"].items() if k != "plan_digest"}
check("plan_digest", o.digest_of(plan) == V["plan"]["plan_digest"])
try:
    content = o.open_sealed_capsule(cap, V["keys"]["recipient_private_d"], V["keys"]["recipient_public"]["x"])
    check("sealed_capsule_opens_and_matches_digest", o.digest_of(content) == V["capsule_plaintext_digest"])
except o.OlipError as e:
    if e.code == "DECRYPT_UNAVAILABLE":
        skipped += 1
        details.append("sealed_capsule: skipped (cryptography not installed)")
    else:
        check("sealed_capsule", False)
print(json.dumps({"checked": checked, "failed": failed, "skipped": skipped, "details": details}))
sys.exit(1 if failed else 0)
