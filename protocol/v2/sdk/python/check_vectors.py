"""Checks vectors/golden-vectors.json with the independent Python implementation. Exit code 0 means every vector matched."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import olip_lifecycle as o  # noqa: E402

here = os.path.dirname(os.path.abspath(__file__))
V = json.load(open(os.path.join(here, "..", "..", "vectors", "golden-vectors.json"), encoding="utf-8"))
fails, n = [], 0


def check(name, got, want):
    global n
    n += 1
    if got != want:
        fails.append(f"{name}: got {got!r} want {want!r}")


for c in V["canonical_json"]:
    check(f"canonical {c['name']}", o.canonicalize(c["input"]), c["canonical"])
    check(f"sha256 {c['name']}", o.digest_of(c["input"]), c["sha256"])
keys = {k["label"]: k["public_jwk"] for k in V["keys"]}
for s in V["signatures"]:
    r = o.verify_detached(s["object"], [keys[s["signer_label"]]])
    check(f"signature {s['name']}", r["ok"], s["expect_valid"])
    if "expect_reason" in s:
        check(f"signature reason {s['name']}", r.get("reason"), s["expect_reason"])
    if "signing_input" in s:
        check(f"signing input {s['name']}", o.canonicalize({k: v for k, v in s["object"].items() if k != "signature"}), s["signing_input"])
for g in V["grant_digest"]["vectors"]:
    check(f"grant {g['name']}", o.grant_digest(g["grant"]), g["grant_digest"])
check("journal chain", o.verify_journal(V["journal_chain"]["entries"])["ok"], True)
broken = json.loads(json.dumps(V["journal_chain"]["entries"]))
broken[1]["event"]["event_type"] = "consent.revoked"
check("journal tamper detected", o.verify_journal(broken)["ok"], False)
for z in V["zoned_times"]:
    r = o.check_zoned_time(z["start_utc"], z["timezone"], z["local_start"])
    check(f"zoned {z['timezone']} {z['start_utc']}", (r["ok"], r.get("reason")), (z["expect_ok"], z.get("expect_reason")))
w = V["webhooks"]
for c in w["cases"]:
    r = o.check_webhook(w["body"], [keys[w["host_key_label"]]], set(c["seen"]), now=c["now"], max_skew_seconds=w["max_skew_seconds"])
    check(f"webhook {c['name']}", (r["ok"], r.get("reason")), (c["expect_ok"], c.get("expect_reason")))
check("offer digest", o.digest_of(V["offer_digest"]["offer"]), V["offer_digest"]["offer_digest"])
check("message content digest", o.digest_of(V["message_content_digest"]["content"]), V["message_content_digest"]["content_digest"])

print(json.dumps({"checked": n, "failed": len(fails), "failures": fails}))
sys.exit(1 if fails else 0)
