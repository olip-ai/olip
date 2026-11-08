#!/usr/bin/env python3
"""Second OLIP agent client (Python, standard library only). Runs one complete FICTIONAL handoff against any
OLIP endpoint that offers the mock harness, then checks the recipient's signed receipt itself.
Same honest label as the alt server: same author as the Node client, separate code, NOT independent.
Usage: python3 alt-python/olip_client.py http://127.0.0.1:8787
"""
import base64, hashlib, json, sys, uuid, urllib.request, urllib.error, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ed25519_pure as ed

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787").rstrip("/")
TOKEN = [None]


def call(method, path, body=None, headers=None, raw=False):
    h = {"content-type": "application/json", "olip-version": "0.1", **(headers or {})}
    if TOKEN[0]:
        h["authorization"] = "Bearer " + TOKEN[0]
    req = urllib.request.Request(BASE + path, method=method, headers=h, data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req) as r:
            data = r.read().decode()
            return r.status, (data if raw else json.loads(data))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


def canon(o):
    return json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def b64u_dec(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def verify_obj(obj, jwks):
    sig = obj.get("signature") or {}
    key = next((k for k in jwks["keys"] if k["kid"] == sig.get("kid")), None)
    if not key or sig.get("alg") != "EdDSA":
        return False
    body = {k: v for k, v in obj.items() if k != "signature"}
    return ed.verify(b64u_dec(key["x"]), canon(body).encode(), b64u_dec(sig["value"]))


def main():
    steps = []
    fx = call("GET", "/mock/fixtures")[1]
    j, m = fx["jurisdiction_supported"], fx["matter_supported"]
    st, tok = call("POST", "/oauth/token", {"grant_type": "client_credentials", **fx["clients"]["b"]})
    assert st == 200, tok
    TOKEN[0] = tok["access_token"]
    st, disc = call("GET", f"/olip/v0.1/providers?jurisdiction={j}&matter={m}")
    steps.append(("discover", st, len(disc["results"])))
    # The fictional user picks one named lawyer from the unranked list (here: the fixture with direct intake).
    choice = fx["professionals"]["direct_ok"]
    assert any(r["id"] == choice for r in disc["results"]), "chosen lawyer not listed"
    email = f"lee.{uuid.uuid4().hex[:6]}@example.test"
    cb = {"fictional": True, "client": {"name": "Lee Sample (fictional)", "email": email}, "location": {"jurisdiction": j}, "matter": {"code": m},
          "summary": "Fictional: landlord says I must leave in 10 days.", "key_dates": [{"label": "Move-out date in notice (fictional)", "date": "2026-11-30", "kind": "deadline", "certainty": "user_reported"}]}
    st, c = call("POST", "/olip/v0.1/casebriefs", {"casebrief": cb})
    steps.append(("create_casebrief", st, c["casebrief"]["revision"]))
    cb_id = c["casebrief"]["id"]
    cb2 = dict(c["casebrief"], summary="Fictional: landlord says I must leave in 10 days. I have paid rent every month.")
    st, u = call("PUT", f"/olip/v0.1/casebriefs/{cb_id}", {"casebrief": cb2})
    steps.append(("edit_casebrief", st, u["casebrief"]["revision"]))
    fields = ["summary", "client.name", "client.email", "location.jurisdiction", "matter.code", "key_dates"]
    st, pv = call("POST", "/olip/v0.1/handoff-previews", {"casebrief_id": cb_id, "recipient_id": choice, "fields": fields, "selection": {"by": "user"}})
    steps.append(("preview", st, pv.get("preview", {}).get("recipient", {}).get("display_name")))
    pv = pv["preview"]
    # Mock only: play the human. Open the page, ask for a code, read the fictional inbox, confirm.
    url = pv["approval"]["url"]
    k = re.search(r"[?&]k=([^&]+)", url).group(1)
    path = url.split("?")[0]
    TOKEN_SAVE, TOKEN[0] = TOKEN[0], None
    st, page = call("GET", url, raw=True)
    shown = re.search(r'data-olip="consent_digest">([^<]+)<', page).group(1)
    call("POST", path + "/send-code", {"k": k})
    code = [x for x in call("GET", f"/mock/inbox?address={email}")[1]["messages"] if x["preview_id"] == pv["preview_id"]][-1]["code"]
    st, ap = call("POST", path + "/confirm", {"k": k, "code": code, "consent_digest": shown})
    TOKEN[0] = TOKEN_SAVE
    steps.append(("user_approved", st, ap.get("authorization", {}).get("method")))
    st, g = call("GET", f"/olip/v0.1/handoff-previews/{pv['preview_id']}")
    auth_id = g["preview"]["authorization_id"]
    key = str(uuid.uuid4())
    st, s = call("POST", "/olip/v0.1/handoffs", {"authorization_id": auth_id, "consent_digest": pv["consent_digest"]}, {"idempotency-key": key})
    h = s["handoff"]
    steps.append(("submit", st, h["state"]))
    st2, s2 = call("POST", "/olip/v0.1/handoffs", {"authorization_id": auth_id, "consent_digest": pv["consent_digest"]}, {"idempotency-key": key})
    steps.append(("retry_same_key", st2, s2.get("idempotent_replay")))
    jwks = call("GET", "/.well-known/olip-keys.json")[1]
    rc = h["receipt"]
    receipt_ok = bool(rc) and verify_obj(rc, jwks) and rc["consent_digest"] == pv["consent_digest"] and rc["payload_sha256"] == "sha256:" + hashlib.sha256(canon(h["payload"]).encode()).hexdigest()
    steps.append(("receipt_signature_and_digest_verified_in_python", None, receipt_ok))
    st, stat = call("GET", f"/olip/v0.1/handoffs/{h['handoff_id']}")
    steps.append(("status", st, stat["handoff"]["state"]))
    ok = h["state"] == "delivered" and receipt_ok and s2.get("idempotent_replay") is True and stat["handoff"]["engagement"]["status"] == "unknown"
    print(json.dumps({"agent": "python-client", "endpoint": BASE, "ok": ok, "steps": steps}))
    sys.exit(0 if ok else 1)


main()
