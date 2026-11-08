#!/usr/bin/env python3
"""Second OLIP 0.1 endpoint, written separately in Python from the written spec (standard library only).

HONEST LABEL: this was written by the same author (an AI working for the spec sponsor) as the Node reference
server. It shares no code with it, uses different fictional data and its own Ed25519 code, but it is NOT an
independent implementation in the sense the V7 gate requires. It exists to test that the spec text is
implementable twice and that signatures/digests interoperate across languages.

MOCK MODE ONLY. Fictional data. Run: python3 alt-python/olip_alt_server.py  (PORT, default 8788)
"""
import base64, hashlib, hmac, json, os, re, secrets, threading
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs
import html as htmlmod
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import ed25519_pure as ed

HERE = os.path.dirname(os.path.abspath(__file__))
SM = json.load(open(os.path.join(HERE, "..", "spec", "status-machine.json")))
TAX = {c["code"]: c for c in json.load(open(os.path.join(HERE, "..", "spec", "taxonomy-0.1.json")))["codes"]}
V = "0.1"
LOCK = threading.Lock()


def canon(o):
    return json.dumps(o, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha(s):
    return "sha256:" + hashlib.sha256(s.encode("utf-8")).hexdigest()


def b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


SECRET = secrets.token_bytes(32)
KID = "py_" + secrets.token_hex(5)
JWK = {"kty": "OKP", "crv": "Ed25519", "x": b64u(ed.public_key(SECRET)), "kid": KID, "alg": "EdDSA", "use": "sig"}


def signed(obj):
    body = {k: v for k, v in obj.items() if k != "signature"}
    sig = ed.sign(SECRET, canon(body).encode("utf-8"))
    out = dict(body)
    out["signature"] = {"alg": "EdDSA", "kid": KID, "value": b64u(sig)}
    return out


# ---------------- fictional data (different from the Node server) ----------------
def lic(j, num, level, as_of):
    if level == "official_source_checked":
        return {"jurisdiction": j, "authority": f"Fictional {j} bar registry (test data)", "license_id": num,
                "status": {"value": "active", "status": "official_source_checked", "as_of": as_of},
                "verification": {"level": level, "checked_at": as_of, "freshness_days": 90,
                                 "source": {"name": f"Fictional {j} bar registry (test data)", "url": f"https://bar.example.test/{j}/{num}", "data_as_of": as_of, "retrieved_at": as_of, "evidence_sha256": "sha256:" + "2" * 64}},
                "display_statement": f"Checked with the fictional {j} bar registry on {as_of[:10]}: active. A record check is not an endorsement."}
    return {"jurisdiction": j, "authority": f"Fictional {j} bar registry (test data)", "license_id": num,
            "status": {"value": "active", "status": "indexed_unverified", "as_of": as_of},
            "verification": {"level": "indexed", "checked_at": None, "freshness_days": 90,
                             "source": {"name": "Fictional copied list (test data)", "url": "https://list.example.test/all.csv", "data_as_of": as_of, "retrieved_at": as_of, "evidence_sha256": None}},
            "display_statement": f"Taken from a copied list on {as_of[:10]}. Not checked against the official source."}


def person(pid, first, last, firm, j, level, claim, endpoint, topology, behavior):
    return {"olip_version": V, "id": pid, "type": "individual_lawyer", "display_name": f"{first} {last} (fictional)", "family_name": last, "fictional": True,
            "firm": {"id": "frm_" + pid[4:], "name": firm, "website": f"https://{last.lower()}.example.test", "phone": "+1-555-0150"},
            "licenses": [lic(j, f"TEST-{j[3:]}-{int(hashlib.sha256(pid.encode()).hexdigest(), 16) % 90000 + 10000}", level, "2026-10-29T00:00:00-07:00")],
            "claim": {"status": claim, "method": "bar_email_code" if claim != "unclaimed" else None, "claimed_at": "2026-10-25T08:00:00-07:00" if claim != "unclaimed" else None},
            "self_reported": {"practice_areas": ["housing.landlord_tenant"] if endpoint != "none" else [], "languages": ["en"], "service_territory": [j]},
            "intake_endpoint": {"status": endpoint, "topology": topology, "olip_version": V if topology else None, "last_health_check": "2026-11-06T10:00:00-08:00" if topology else None},
            "commercial": {"paid_placement": False, "affects_order": False}, "extensions": {}, "_behavior": behavior}


PROS = [
    person("prf_alt_lindqvist", "Avery", "Lindqvist", "Lindqvist Renters Clinic (fictional)", "US-WA", "official_source_checked", "claimed_verified", "active", "direct", "direct_ok"),
    person("prf_alt_moreau", "Casey", "Moreau", "Moreau Law (fictional)", "US-WA", "indexed", "unclaimed", "none", None, "no_endpoint"),
    person("prf_alt_nakamura", "Quinn", "Nakamura", "Nakamura Housing Law (fictional)", "US-OR", "official_source_checked", "claimed_verified", "active", "relay_email", "relay_email"),
    person("prf_alt_oyelaran", "Remi", "Oyelaran", "Oyelaran Tenant Law (fictional)", "US-OR", "official_source_checked", "claimed_verified", "unhealthy", "relay_webhook", "offline"),
    person("prf_alt_quist", "Taylor", "Quist", "Quist Law (fictional)", "US-WA", "official_source_checked", "claimed_verified", "active", "direct", "gate_no_listing_agreement"),
]
PRO = {x["id"]: x for x in PROS}
REQ = ["summary", "client.name", "client.email", "location.jurisdiction", "matter.code"]
OPT = ["client.phone", "client.preferred_language", "facts", "objectives", "key_dates", "parties", "open_questions", "location.county", "location.city"]


def mt(code):
    t = TAX[code]
    return {"code": code, "label": t["label"], "sali": t["sali"]}


def pol(x):
    b = x["_behavior"]
    j = x["licenses"][0]["jurisdiction"]
    none = b == "no_endpoint"
    return {"olip_version": V, "professional_id": x["id"], "fictional": True,
            "accepting_new_matters": {"value": None, "status": "unknown"} if none else {"value": True, "status": "self_reported", "as_of": "2026-11-02T00:00:00Z"},
            "capacity": {"value": None, "status": "unknown"}, "jurisdictions": [j], "matter_types": [] if none else [mt("housing.landlord_tenant")],
            "client_side": ["tenant"], "languages": ["en"], "accessibility": {"value": None, "status": "not_provided"}, "exclusions": [],
            "required_fields": REQ, "optional_fields": OPT,
            "delivery": {"topology": x["intake_endpoint"]["topology"], "receipt": "signed_EdDSA" if x["intake_endpoint"]["topology"] in ("direct", "relay_webhook") else ("transport_only" if x["intake_endpoint"]["topology"] else "none")},
            "regulatory": {"modes_allowed": [] if none else ["consumer_selected_listing"], "listing_agreement_accepted": b != "gate_no_listing_agreement"},
            "retention_days": 180, "deadlines_note": "Sending this does not pause any deadline.", "updated_at": "2026-11-02T00:00:00Z", "stale": none, "extensions": {}}


POL = {x["id"]: pol(x) for x in PROS}
RULES = {j: {"review_status": "pending_counsel_review", "modes": {"consumer_selected_listing": True, "direct_firm_intake": True, "referral_service": False, "automated_routing": False}} for j in ("US-WA", "US-OR")}
CLIENTS = {"cli_alt_one": "alt-secret-one", "cli_alt_two": "alt-secret-two"}
RECIP = {"frm_alt_lindqvist": ("alt-secret-firm-l", ["prf_alt_lindqvist"]), "frm_alt_nakamura": ("alt-secret-firm-n", ["prf_alt_nakamura"])}
AID = [{"name": "Fictional Renters Rights Hotline (test data)", "kind": "legal_aid", "url": "https://renters.example.test", "cost": "free"}]
NOTICES = [{"id": "n1", "text": "This does not create an attorney-client relationship."}, {"id": "n2", "text": "This may not be privileged just because it is sent this way."},
           {"id": "n3", "text": "Sending does not stop any deadline."}, {"id": "n4", "text": "Only the one recipient named receives only the fields listed."}]
NOTICE_VERSION = "alt-notices-1"
LABELS = {"summary": "Summary", "client.name": "Name", "client.email": "Email", "client.phone": "Phone", "client.preferred_language": "Language", "location.jurisdiction": "State",
          "location.county": "County", "location.city": "City", "matter.code": "Matter type", "facts": "Facts", "objectives": "Goals", "key_dates": "Dates", "parties": "Parties", "open_questions": "Questions"}

# ---------------- state ----------------
ST = {}
OFFSET = [0.0]


def reset():
    ST.clear()
    ST.update(tokens={}, briefs={}, previews={}, auths={}, otps={}, handoffs={}, idem={}, inbox={}, deliveries={}, analytics=[], logs=[])
    OFFSET[0] = 0.0


reset()


def now():
    return datetime.now(timezone.utc) + timedelta(seconds=OFFSET[0])


def ts(d=None):
    return (d or now()).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def nid(prefix):
    return prefix + "_" + secrets.token_urlsafe(12)


def gp(o, path):
    for k in path.split("."):
        if not isinstance(o, dict):
            return None
        o = o.get(k)
    return o


def E(status, code, message, **extra):
    return status, {"olip_version": V, "error": {"code": code, "message": message, "retryable": status == 429 or status >= 500, **extra}}


def OK(body, status=200):
    return status, {"olip_version": V, **body}


def digest(rid, cb_id, rev, purpose, mode, fields):
    f = sorted(({"path": x["path"], "value": x["value"]} for x in fields), key=lambda z: z["path"])
    return sha(canon({"olip_version": V, "recipient_id": rid, "casebrief_id": cb_id, "casebrief_revision": rev, "purpose": purpose, "mode": mode, "shared_fields": f, "notice_version": NOTICE_VERSION}))


def transition_ok(frm, to, source):
    for t in SM["transitions"]:
        if t["from"] == frm and t["to"] == to:
            return (True, None) if source in t["sources"] else (False, "OLIP_EVENT_SOURCE_FORBIDDEN")
    return False, "OLIP_INVALID_TRANSITION"


def event(h, frm, to, source, ev_type, ref, actor=None):
    ok, code = transition_ok(frm, to, source)
    assert ok, f"illegal {frm}->{to} by {source}"
    e = {"event_id": nid("evt"), "handoff_id": h["handoff_id"], "from_state": frm, "to_state": to, "occurred_at": ts(), "recorded_at": ts(), "time_zone": "UTC",
         "source": source, "actor": actor, "evidence": {"type": ev_type, "ref": ref}}
    return signed(e) if source.startswith("recipient") else e


def track(op, outcome, principal=None, j=None, m=None):
    ST["analytics"].append({"at": ts(), "op": op, "outcome": outcome, "client": principal["id"] if principal and principal["kind"] == "client" else None, "jurisdiction": j, "matter_code": m})


# ---------------- operations ----------------
def interpret(q):
    t = " " + q.lower() + " "
    cands = []
    if any(w in t for w in ("evict", "landlord", "lease", "rent ", "tenant", "deposit")):
        side = {"value": "tenant", "status": "inferred", "basis": ["first-person renter wording"]} if any(w in t for w in ("my landlord", "evict me", "my apartment", "i rent")) else {"value": None, "status": "unknown"}
        cands.append({"code": "housing.landlord_tenant", "label": TAX["housing.landlord_tenant"]["label"], "sali": TAX["housing.landlord_tenant"]["sali"], "confidence": "medium", "basis": ["housing words"], "client_side": side})
    j = {"value": None, "status": "unknown"}
    for code, words in (("US-WA", ("washington", "seattle", "tacoma")), ("US-OR", ("oregon", "portland", "salem"))):
        if any(w in t for w in words):
            j = {"value": code, "status": "inferred"}
    unknowns = []
    if not j["value"]:
        unknowns.append({"field": "location.jurisdiction", "question": "What state are you in?"})
    if cands:
        unknowns.append({"field": "key_dates", "question": "Did you get a notice or court paper? What date is on it?"})
    else:
        unknowns.append({"field": "matter.code", "question": "What is the problem about?"})
    return {"method": "keyword_rules_alt", "matter_candidates": cands, "jurisdiction": j, "unknowns": unknowns, "statement": "Automatic reading of your words, not legal advice. Please check it."}


def summary(x, matched):
    return {"id": x["id"], "type": x["type"], "display_name": x["display_name"], "fictional": True, "firm": x["firm"],
            "licenses": [{"jurisdiction": l["jurisdiction"], "license_id": l["license_id"], "verification_level": l["verification"]["level"], "display_statement": l["display_statement"]} for l in x["licenses"]],
            "claim_status": x["claim"]["status"], "intake_endpoint_status": x["intake_endpoint"]["status"], "matter_types": matched, "commercial": x["commercial"],
            "links": {"identity": f"/olip/v0.1/professionals/{x['id']}", "intake_policy": f"/olip/v0.1/professionals/{x['id']}/intake-policy"}}


def public(x):
    return {k: v for k, v in x.items() if not k.startswith("_")}


def op_discover(pr, q):
    interp = interpret(q["q"]) if q.get("q") else None
    j = q.get("jurisdiction") or (interp and interp["jurisdiction"]["value"])
    m = q.get("matter") or (interp and len(interp["matter_candidates"]) == 1 and interp["matter_candidates"][0]["code"]) or None
    res = []
    for x in sorted(PROS, key=lambda z: z["family_name"]):
        p = POL[x["id"]]
        if j and j not in p["jurisdictions"]:
            continue
        if m and not any(t["code"] == m for t in p["matter_types"]):
            continue
        res.append(summary(public(x), [t for t in p["matter_types"] if not m or t["code"] == m]))
    track("discover_providers", "results" if res else "no_match", pr, j, m)
    return OK({"interpretation": interp, "query": {"jurisdiction": j, "matter": m}, "ordering": {"method": "family_name_alphabetical", "paid_influence": False, "disclosure": "Alphabetical by family name. Payment never changes the list or its order."},
               "results": res, "no_match": None if res else {"reason": "nothing_fits_filters", "message": "Nobody listed fits. Free help options are below."}, "legal_aid_options": AID, "notices": [NOTICES[0]]})


def need_client(pr):
    if not pr:
        return E(401, "OLIP_UNAUTHENTICATED", "Token required.")
    if pr["kind"] != "client":
        return E(403, "OLIP_FORBIDDEN", "Client token required.")
    return None


def shape(cb):
    p = []
    if not isinstance(cb, dict):
        return ["casebrief must be an object"]
    em = gp(cb, "client.email")
    if em is not None and not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", str(em)):
        p.append("bad client.email")
    jj = gp(cb, "location.jurisdiction")
    if jj is not None and not re.match(r"^US-[A-Z]{2}$", str(jj)):
        p.append("bad location.jurisdiction")
    for k in ("facts", "objectives", "key_dates", "parties", "open_questions", "documents"):
        if k in cb and not isinstance(cb[k], list):
            p.append(f"{k} must be a list")
    return p


def own_brief(pr, bid):
    r = ST["briefs"].get(bid)
    return r if r and r["owner"] == pr["id"] else None


def gate(cb, x, mode, selection):
    j = gp(cb, "location.jurisdiction")
    p = POL[x["id"]]
    checks = []
    alts = [{"kind": "contact_directly", "description": f"Call {x['firm']['phone']} or visit {x['firm']['website']}."}, {"kind": "legal_aid", "description": "Free legal help options."}]

    def block(code, msg, extra=()):
        return {"result": "blocked", "code": code, "message": msg, "checks": checks, "rules_review_status": RULES.get(j, {}).get("review_status", "no_rules"), "allowed_alternatives": list(extra) + alts}
    if not j:
        return block("jurisdiction_unknown", "State unknown.")
    if j not in RULES:
        return block("jurisdiction_not_supported", f"No rules for {j}.")
    allowed = RULES[j]["modes"].get(mode)
    checks.append({"check": "mode_allowed_in_jurisdiction", "passed": bool(allowed)})
    if not allowed:
        return block("mode_not_allowed", f"Mode {mode} is not allowed here (illustrative rules).", [{"kind": "use_mode", "mode": "consumer_selected_listing", "description": "Let the user pick one named lawyer and approve sending to that lawyer."}])
    lic_ok = j in p["jurisdictions"]
    checks.append({"check": "recipient_licensed_in_jurisdiction", "passed": lic_ok})
    if not lic_ok:
        return block("recipient_not_licensed_here", "No license record here.")
    has = x["intake_endpoint"]["status"] in ("active", "unhealthy")
    checks.append({"check": "recipient_has_intake_endpoint", "passed": has})
    if not has:
        return block("recipient_has_no_intake_endpoint", "No online intake. Contact the firm directly.")
    if mode not in p["regulatory"]["modes_allowed"]:
        return block("recipient_does_not_accept_mode", "Recipient does not accept this mode.")
    checks.append({"check": "recipient_listing_agreement_accepted", "passed": p["regulatory"]["listing_agreement_accepted"]})
    if not p["regulatory"]["listing_agreement_accepted"]:
        return block("recipient_listing_agreement_missing", "Recipient has not accepted listing terms. Contact the firm directly.")
    sel = isinstance(selection, dict) and selection.get("by") == "user"
    checks.append({"check": "user_selected_recipient", "passed": sel})
    if not sel:
        return block("recipient_not_selected_by_user", "The user must choose the recipient.")
    mok = any(t["code"] == gp(cb, "matter.code") for t in p["matter_types"])
    checks.append({"check": "recipient_lists_matter_type", "passed": mok})
    if not mok:
        return block("recipient_does_not_list_matter", "Recipient does not list this matter type.")
    return {"result": "allowed", "code": "allowed", "message": "Allowed by illustrative rules pending legal review.", "checks": checks, "rules_review_status": "pending_counsel_review", "allowed_alternatives": []}


def view_preview(pv):
    return {k: v for k, v in pv.items() if k not in ("owner", "_k")}


def expire(pv):
    if pv["state"] == "draft" and parse_ts(pv["expires_at"]) <= now():
        pv["state"] = "expired"


def view_handoff(h):
    out = {k: v for k, v in h.items() if k != "owner"}
    out["state_meaning"] = SM["states"][h["state"]]["meaning"]
    out["engagement"] = {"status": "unknown", "statement": "Delivered or acknowledged is not acceptance of the matter and creates no attorney-client relationship."}
    return json.loads(json.dumps(out))


def can_see(pr, h):
    if not pr:
        return False
    if pr["kind"] == "client":
        return h["owner"] == pr["id"]
    reached = h["state"] in SM["transmitted_states"] or (h["state"] == "cancelled" and h["cancellation"] and h["cancellation"]["effect"] != "not_transmitted")
    return h["recipient_id"] in pr["pros"] and reached


def deliver(h, x):
    b = x["_behavior"]
    if h["delivery"]["topology"] == "direct":
        h["receipt"] = signed({"receipt_id": nid("rcp"), "handoff_id": h["handoff_id"], "recipient_id": x["id"], "received_at": ts(), "payload_sha256": h["payload_sha256"],
                               "consent_digest": h["consent_digest"], "retention_days": POL[x["id"]]["retention_days"], "statement": "Stored by the recipient's intake system. Not proof anyone read it; not acceptance."})
        h["events"].append(event(h, "approved", "delivered", "recipient_system", "recipient_receipt", h["receipt"]["receipt_id"]))
        h["state"] = "delivered"
        ST["deliveries"][x["id"]] = ST["deliveries"].get(x["id"], 0) + 1
    elif b == "relay_email":
        h["events"].append(event(h, "approved", "queued", "host", "host_storage", h["handoff_id"]))
        ref = "mock-mta-queued-" + nid("m")
        h["delivery"]["attempts"].append({"at": ts(), "outcome": "accepted_by_transport", "channel": "email", "transport_ref": ref})
        h["events"].append(event(h, "queued", "sent", "transport", "transport_acceptance", ref))
        h["state"] = "sent"
        ST["deliveries"][x["id"]] = ST["deliveries"].get(x["id"], 0) + 1
    else:
        h["events"].append(event(h, "approved", "queued", "host", "host_storage", h["handoff_id"]))
        for _ in range(3):
            h["delivery"]["attempts"].append({"at": ts(), "outcome": "failed", "channel": "webhook", "error_code": "OLIP_RECIPIENT_UNREACHABLE"})
        h["events"].append(event(h, "queued", "failed", "host", "delivery_attempts_exhausted", "3_attempts"))
        h["state"] = "failed"
    h["updated_at"] = ts()


def handle(method, path, q, body, headers):
    hv = headers.get("olip-version")
    if hv and not re.match(r"^0\.1(\.\d+)?$", hv):
        return E(400, "OLIP_VERSION_UNSUPPORTED", f"Version {hv} not supported.", supported_versions=[V])
    if method == "GET" and path == "/.well-known/olip.json":
        return 200, {"olip_version": V, "supported_versions": [V], "implementation": {"name": "OLIP alt mock server (Python)", "version": "0.1.0-alt", "mode": "mock", "fictional_data_only": True},
                     "profiles": ["olip-read", "olip-write", "olip-mock-harness"], "operations": [{"name": n, "method": m_, "path": p_, "auth": a_} for n, m_, p_, a_ in OPS_LIST],
                     "auth": {"token_endpoint": "/oauth/token", "grant_types": ["client_credentials"]}, "keys_url": "/.well-known/olip-keys.json", "bindings": {"https": "/olip/v0.1"}, "extensions_supported": []}
    if method == "GET" and path == "/.well-known/olip-keys.json":
        return 200, {"keys": [JWK]}
    if method == "GET" and path == "/olip/v0.1/status-machine":
        return 200, SM
    if method == "POST" and path == "/oauth/token":
        cid, sec = body.get("client_id"), body.get("client_secret")
        pr = None
        if cid in CLIENTS and hmac.compare_digest(str(sec or ""), CLIENTS[cid]):
            pr = {"kind": "client", "id": cid}
        elif cid in RECIP and hmac.compare_digest(str(sec or ""), RECIP[cid][0]):
            pr = {"kind": "recipient", "id": cid, "pros": RECIP[cid][1]}
        if body.get("grant_type") != "client_credentials" or not pr:
            return 401, {"error": "invalid_client"}
        tok = "pyat_" + secrets.token_urlsafe(24)
        ST["tokens"][tok] = (pr, now() + timedelta(minutes=15))
        return 200, {"access_token": tok, "token_type": "Bearer", "expires_in": 900}
    if path.startswith("/mock/"):
        return mock(method, path, q, body)
    m = re.match(r"^/olip/v0\.1/approvals/([\w-]+)(/send-code|/confirm)?$", path)
    if m:
        return approval(method, m.group(1), m.group(2), q, body)
    # auth (optional for public reads)
    pr = None
    a = headers.get("authorization", "")
    if a.startswith("Bearer "):
        t = ST["tokens"].get(a[7:])
        if not t:
            return E(401, "OLIP_UNAUTHENTICATED", "Bad token.")
        if t[1] <= now():
            return E(401, "OLIP_TOKEN_EXPIRED", "Token expired.")
        pr = t[0]
    if method == "GET" and path == "/olip/v0.1/providers":
        return op_discover(pr, q)
    m = re.match(r"^/olip/v0\.1/professionals/([\w-]+)(/intake-policy)?$", path)
    if m and method == "GET":
        x = PRO.get(m.group(1))
        if not x:
            return E(404, "OLIP_NOT_FOUND", "Unknown professional.")
        return OK({"intake_policy": POL[x["id"]]}) if m.group(2) else OK({"professional": public(x), "notices": [NOTICES[0]]})
    err = need_client(pr) if not path.startswith("/olip/v0.1/handoffs/") else (None if pr else E(401, "OLIP_UNAUTHENTICATED", "Token required."))
    if err:
        return err
    if method == "POST" and path == "/olip/v0.1/casebriefs/validate":
        cb = body.get("casebrief") or {}
        req = POL[body["recipient_id"]]["required_fields"] if body.get("recipient_id") in POL else REQ
        missing = [f for f in req if gp(cb, f) in (None, "", [])]
        warn = [{"code": "possible_ssn", "message": "Remove the Social Security number."}] if re.search(r"\b\d{3}-\d{2}-\d{4}\b", json.dumps(cb)) else []
        return OK({"valid": not missing and not shape(cb), "transmitted": False, "missing_required": missing, "shape_problems": shape(cb), "warnings": warn,
                   "open_questions": [{"field": f, "question": f"Please add {LABELS.get(f, f).lower()}."} for f in missing], "statement": "Nothing was sent."})
    if method == "POST" and path == "/olip/v0.1/casebriefs":
        cb = body.get("casebrief", body)
        sp = shape(cb)
        if sp:
            return E(400, "OLIP_INVALID_REQUEST", "Bad CaseBrief.", details=sp)
        bid = nid("cbr")
        doc = dict(json.loads(json.dumps(cb)), olip_version=V, id=bid, revision=1, created_at=ts(), updated_at=ts(), content_trust="untrusted_user_supplied")
        ST["briefs"][bid] = {"owner": pr["id"], "cb": doc}
        track("create_casebrief", "ok", pr)
        return OK({"casebrief": doc, "transmitted": False}, 201)
    m = re.match(r"^/olip/v0\.1/casebriefs/([\w-]+)(/export)?$", path)
    if m:
        r = own_brief(pr, m.group(1))
        if not r:
            return E(404, "OLIP_NOT_FOUND", "Unknown CaseBrief.")
        if m.group(2) and method == "GET":
            hs = [{"handoff_id": h["handoff_id"], "recipient_id": h["recipient_id"], "state": h["state"]} for h in ST["handoffs"].values() if h["casebrief_id"] == r["cb"]["id"]]
            return OK({"format": "olip-casebrief-export-0.1", "casebrief": r["cb"], "handoffs": hs})
        if method == "GET":
            return OK({"casebrief": r["cb"]})
        if method == "PUT":
            im = headers.get("if-match")
            if im and int(im.strip('"')) != r["cb"]["revision"]:
                return E(409, "OLIP_REVISION_CONFLICT", "Revision changed.")
            cb = body.get("casebrief", body)
            sp = shape(cb)
            if sp:
                return E(400, "OLIP_INVALID_REQUEST", "Bad CaseBrief.", details=sp)
            keep = {k: v for k, v in cb.items() if k not in ("id", "revision", "created_at", "olip_version", "content_trust")}
            r["cb"] = dict(json.loads(json.dumps(keep)), olip_version=V, id=r["cb"]["id"], revision=r["cb"]["revision"] + 1, created_at=r["cb"]["created_at"], updated_at=ts(), content_trust="untrusted_user_supplied")
            return OK({"casebrief": r["cb"], "transmitted": False, "statement": "New revision saved; earlier approvals no longer match."})
        if method == "DELETE":
            bid = r["cb"]["id"]
            del ST["briefs"][bid]
            sent = [{"handoff_id": h["handoff_id"], "recipient_id": h["recipient_id"], "state": h["state"]} for h in ST["handoffs"].values()
                    if h["casebrief_id"] == bid and (h["state"] in SM["transmitted_states"] or (h["cancellation"] or {}).get("effect") == "withdrawal_notice_sent_recipient_may_retain_copy")]
            return OK({"deleted": True, "limits": ["Recipients who already got a copy keep it under their own rules. Ask them to delete it."] if sent else [], "already_transmitted": sent})
    if method == "POST" and path == "/olip/v0.1/handoff-previews":
        return preview(pr, body)
    m = re.match(r"^/olip/v0\.1/handoff-previews/([\w-]+)(/revoke)?$", path)
    if m:
        pv = ST["previews"].get(m.group(1))
        if not pv or pv["owner"] != pr["id"]:
            return E(404, "OLIP_NOT_FOUND", "Unknown preview.")
        expire(pv)
        if m.group(2) and method == "POST":
            if pv["state"] not in ("draft", "approved"):
                return E(409, "OLIP_INVALID_TRANSITION", f"Preview is {pv['state']}.")
            pv["state"] = "cancelled"
            if pv["authorization_id"]:
                ST["auths"][pv["authorization_id"]]["revoked"] = True
            return OK({"preview": view_preview(pv), "statement": "Approval withdrawn. Nothing was sent."})
        return OK({"preview": view_preview(pv)})
    if method == "POST" and path == "/olip/v0.1/handoffs":
        return submit(pr, body, headers.get("idempotency-key"))
    m = re.match(r"^/olip/v0\.1/handoffs/([\w-]+)(/cancel|/events)?$", path)
    if m:
        h = ST["handoffs"].get(m.group(1))
        if not h or not can_see(pr, h):
            return E(404, "OLIP_NOT_FOUND", "Unknown handoff.")
        if not m.group(2) and method == "GET":
            return OK({"handoff": view_handoff(h)})
        if m.group(2) == "/cancel" and method == "POST":
            if pr["kind"] != "client":
                return E(403, "OLIP_FORBIDDEN", "Client token required.")
            ok, code = transition_ok(h["state"], "cancelled", "client")
            if not ok:
                return E(409, code, f"Handoff is {h['state']}.")
            sent = h["state"] in SM["transmitted_states"]
            h["events"].append(event(h, h["state"], "cancelled", "client", "cancel_request", nid("cx")))
            h["state"] = "cancelled"
            h["cancellation"] = {"requested_at": ts(), "effect": "withdrawal_notice_sent_recipient_may_retain_copy" if sent else "not_transmitted",
                                 "limits": ["The recipient already has it and may keep a copy under its own rules."] if sent else []}
            return OK({"handoff": view_handoff(h)})
        if m.group(2) == "/events" and method == "POST":
            if pr["kind"] != "recipient":
                return E(403, "OLIP_EVENT_SOURCE_FORBIDDEN", "Only the recipient can record this.")
            typ = body.get("type")
            if typ not in SM["recipient_event_types"]:
                return E(403, "OLIP_EVENT_SOURCE_FORBIDDEN", f"Recipient cannot record {typ}.")
            ev = body.get("evidence") or {}
            if ev.get("type") != "recipient_attestation" or not ev.get("ref"):
                return E(400, "OLIP_EVIDENCE_REQUIRED", "Evidence required.")
            human = (body.get("actor") or {}).get("kind") == "human"
            src = "recipient_human" if human else "recipient_system"
            ok, code = transition_ok(h["state"], typ, src)
            if not ok:
                return E(409 if code == "OLIP_INVALID_TRANSITION" else 403, code, f"Cannot go from {h['state']} to {typ} as {src}.")
            h["events"].append(event(h, h["state"], typ, src, "recipient_attestation", str(ev["ref"])[:200], {"kind": "human" if human else "automated", "role": (body.get("actor") or {}).get("role")}))
            h["state"] = typ
            h["updated_at"] = ts()
            return OK({"handoff": view_handoff(h)})
    return E(404, "OLIP_NOT_FOUND", "No such operation.")


def preview(pr, b):
    r = own_brief(pr, b.get("casebrief_id"))
    if not r:
        return E(404, "OLIP_NOT_FOUND", "Unknown CaseBrief.")
    if isinstance(b.get("recipient_ids"), list) and len(b["recipient_ids"]) != 1:
        return E(400, "OLIP_ONE_RECIPIENT_ONLY", "Exactly one recipient per preview.")
    rid = b.get("recipient_id") or (b.get("recipient_ids") or [None])[0]
    x = PRO.get(rid)
    if not x:
        return E(404, "OLIP_NOT_FOUND", "Unknown professional.")
    mode, purpose = b.get("mode") or "consumer_selected_listing", b.get("purpose") or "request_initial_contact"
    fields = list(dict.fromkeys(b.get("fields") or []))
    if not fields:
        return E(400, "OLIP_INVALID_REQUEST", "fields required.")
    cb = r["cb"]
    g = gate(cb, x, mode, b.get("selection"))
    if g["result"] != "allowed":
        return E(422, "OLIP_POLICY_BLOCKED", g["message"], policy_gate=g, allowed_alternatives=g["allowed_alternatives"])
    p = POL[rid]
    bad = [f for f in fields if f not in p["required_fields"] + p["optional_fields"]]
    if bad:
        return E(422, "OLIP_FIELD_NOT_ACCEPTED", "Not accepted.", details=bad)
    miss = [f for f in p["required_fields"] if f not in fields or gp(cb, f) in (None, "")]
    if miss:
        return E(422, "OLIP_REQUIRED_FIELD_MISSING", "Required.", details=miss)
    shared = [{"path": f, "label": LABELS.get(f, f), "value": json.loads(json.dumps(gp(cb, f)))} for f in fields if gp(cb, f) is not None]
    withheld = [f for f in list(LABELS) + ["documents"] if f not in fields and gp(cb, f) is not None]
    pid, k = nid("prv"), secrets.token_urlsafe(18)
    pv = {"olip_version": V, "preview_id": pid, "state": "draft", "owner": pr["id"], "casebrief_id": cb["id"], "casebrief_revision": cb["revision"],
          "recipient": {"professional_id": rid, "display_name": x["display_name"], "firm_name": x["firm"]["name"], "license_statements": [l["display_statement"] for l in x["licenses"]],
                        "intake_endpoint_status": x["intake_endpoint"]["status"], "delivery_topology": p["delivery"]["topology"]},
          "mode": mode, "purpose": purpose, "shared_fields": shared, "withheld_fields": withheld, "notices": NOTICES, "notice_version": NOTICE_VERSION, "policy_gate": g,
          "consent_digest": digest(rid, cb["id"], cb["revision"], purpose, mode, shared), "created_at": ts(), "expires_at": ts(now() + timedelta(minutes=30)),
          "approval": {"method": "hosted_otp", "url": f"/olip/v0.1/approvals/{pid}?k={k}", "instructions": "Give this link to the user. The agent cannot approve."}, "authorization_id": None, "_k": k}
    ST["previews"][pid] = pv
    return OK({"preview": view_preview(pv), "transmitted": False}, 201)


def approval(method, pid, step, q, b):
    pv = ST["previews"].get(pid)
    k = (q.get("k") if method == "GET" else b.get("k"))
    if not pv or k != pv["_k"]:
        return E(404, "OLIP_NOT_FOUND", "Unknown link.")
    expire(pv)
    if method == "GET" and not step:
        e = htmlmod.escape
        rows = "".join(f"<tr><th>{e(f['label'])}</th><td>{e(f['value'] if isinstance(f['value'], str) else json.dumps(f['value']))}</td></tr>" for f in pv["shared_fields"])
        page = (f"<!doctype html><html lang=en><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>Approve (test)</title>"
                f"<style>body{{font:16px system-ui;max-width:700px;margin:auto;padding:16px;background:#fff;color:#111}}@media(prefers-color-scheme:dark){{body{{background:#111;color:#eee}}}}</style></head>"
                f"<body><p><b>TEST MODE, fictional data.</b></p><h1>Send to <span data-olip=\"recipient\">{e(pv['recipient']['display_name'])}</span>?</h1><table>{rows}</table>"
                f"<ul>{''.join('<li>' + e(n['text']) + '</li>' for n in pv['notices'])}</ul><p>Code: <code data-olip=\"consent_digest\">{e(pv['consent_digest'])}</code></p></body></html>")
        return 200, page
    if pv["state"] != "draft":
        return E(409, "OLIP_INVALID_TRANSITION", f"Preview is {pv['state']}.")
    if step == "/send-code":
        email = gp(ST["briefs"].get(pv["casebrief_id"], {}).get("cb", {}), "client.email")
        if not email:
            return E(422, "OLIP_REQUIRED_FIELD_MISSING", "No email.")
        code = f"{secrets.randbelow(10**6):06d}"
        ST["otps"][pid] = {"code": code, "exp": now() + timedelta(minutes=10), "tries": 0}
        ST["inbox"].setdefault(email.lower(), []).append({"at": ts(), "subject": "Approval code", "code": code, "preview_id": pid})
        return OK({"code_sent": True})
    o = ST["otps"].get(pid)
    if not o or o["exp"] <= now():
        return E(410, "OLIP_APPROVAL_CODE_EXPIRED", "Ask for a new code.")
    o["tries"] += 1
    if o["tries"] > 5:
        del ST["otps"][pid]
        return E(429, "OLIP_RATE_LIMITED", "Too many tries.")
    if not hmac.compare_digest(str(b.get("code")), o["code"]):
        return E(403, "OLIP_APPROVAL_CODE_WRONG", "Wrong code.")
    if b.get("consent_digest") != pv["consent_digest"]:
        return E(409, "OLIP_CONSENT_MISMATCH", "Out of date page.")
    del ST["otps"][pid]
    aid = nid("auz")
    a = {"olip_version": V, "authorization_id": aid, "preview_id": pid, "consent_digest": pv["consent_digest"], "method": "hosted_otp", "approved_at": ts(), "expires_at": ts(now() + timedelta(minutes=30)), "single_use": True}
    ST["auths"][aid] = dict(a, owner=pv["owner"], used=False, revoked=False)
    pv["state"], pv["authorization_id"] = "approved", aid
    return OK({"authorization": a}, 201)


def submit(pr, b, key):
    if not key or not (8 <= len(key) <= 200):
        return E(428, "OLIP_IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key required.")
    bh = sha(canon({"authorization_id": b.get("authorization_id"), "consent_digest": b.get("consent_digest"), "recipient_id": b.get("recipient_id")}))
    ik = pr["id"] + ":" + key
    if ik in ST["idem"]:
        prev = ST["idem"][ik]
        if prev[0] != bh:
            return E(422, "OLIP_IDEMPOTENCY_KEY_REUSED", "Key used with another request.")
        return OK({"handoff": view_handoff(ST["handoffs"][prev[1]]), "idempotent_replay": True}, 200)
    a = ST["auths"].get(b.get("authorization_id"))
    if not a or a["owner"] != pr["id"]:
        return E(403, "OLIP_AUTHORIZATION_INVALID", "No such approval for this caller.")
    pv = ST["previews"][a["preview_id"]]
    if a["revoked"]:
        return E(409, "OLIP_AUTHORIZATION_REVOKED", "Withdrawn.")
    if a["used"]:
        return E(409, "OLIP_AUTHORIZATION_USED", "Already used.")
    if parse_ts(a["expires_at"]) <= now():
        pv["state"] = "expired"
        return E(410, "OLIP_AUTHORIZATION_EXPIRED", "Expired.")
    if b.get("consent_digest") != a["consent_digest"] or (b.get("recipient_id") is not None and b["recipient_id"] != pv["recipient"]["professional_id"]):
        return E(409, "OLIP_CONSENT_MISMATCH", "Does not match the approval.")
    r = ST["briefs"].get(pv["casebrief_id"])
    cur = digest(pv["recipient"]["professional_id"], pv["casebrief_id"], r["cb"]["revision"], pv["purpose"], pv["mode"],
                 [{"path": f["path"], "value": gp(r["cb"], f["path"])} for f in pv["shared_fields"]]) if r else None
    if cur != a["consent_digest"]:
        a["revoked"] = True
        pv["state"] = "cancelled"
        return E(409, "OLIP_AUTHORIZATION_STALE", "The CaseBrief changed after approval.")
    x = PRO[pv["recipient"]["professional_id"]]
    g = gate(r["cb"], x, pv["mode"], {"by": "user"})
    if g["result"] != "allowed":
        return E(422, "OLIP_POLICY_BLOCKED", g["message"], policy_gate=g, allowed_alternatives=g["allowed_alternatives"])
    a["used"] = True
    payload = {f["path"]: f["value"] for f in pv["shared_fields"]}
    hid = nid("hnd")
    h = {"olip_version": V, "handoff_id": hid, "owner": pr["id"], "state": "approved", "recipient_id": x["id"], "mode": pv["mode"], "purpose": pv["purpose"], "casebrief_id": pv["casebrief_id"],
         "casebrief_revision": pv["casebrief_revision"], "consent_digest": a["consent_digest"], "authorization_id": a["authorization_id"], "preview_id": pv["preview_id"], "created_at": ts(), "updated_at": ts(),
         "events": [], "payload": payload, "payload_sha256": sha(canon(payload)), "receipt": None, "delivery": {"topology": POL[x["id"]]["delivery"]["topology"], "attempts": [], "max_attempts": 3}, "cancellation": None}
    h["events"].append(event(h, "draft", "approved", "user", "user_approval", a["authorization_id"]))
    pv["state"] = "submitted"
    ST["handoffs"][hid] = h
    deliver(h, x)
    ST["idem"][ik] = (bh, hid)
    track("submit_approved_handoff", h["state"], pr)
    return OK({"handoff": view_handoff(h), "idempotent_replay": False}, 201)


def mock(method, path, q, b):
    if path == "/mock/fixtures":
        return 200, {"professionals": {"direct_ok": "prf_alt_lindqvist", "indexed_only_no_endpoint": "prf_alt_moreau", "relay_email": "prf_alt_nakamura", "offline": "prf_alt_oyelaran",
                                       "gate_no_listing_agreement": "prf_alt_quist", "verified": "prf_alt_lindqvist", "nonpaying_endpoint": "prf_alt_lindqvist"},
                     "clients": {"a": {"client_id": "cli_alt_one", "client_secret": CLIENTS["cli_alt_one"]}, "b": {"client_id": "cli_alt_two", "client_secret": CLIENTS["cli_alt_two"]}},
                     "recipients": {"direct_ok": {"client_id": "frm_alt_lindqvist", "client_secret": RECIP["frm_alt_lindqvist"][0]}, "relay_email": {"client_id": "frm_alt_nakamura", "client_secret": RECIP["frm_alt_nakamura"][0]}},
                     "jurisdiction_supported": "US-WA", "matter_supported": "housing.landlord_tenant", "jurisdictions": {"offline": "US-OR", "relay_email": "US-OR"}, "no_match_jurisdiction": "US-ID"}
    if path == "/mock/inbox":
        return 200, {"messages": ST["inbox"].get(q.get("address", "").lower(), [])}
    if path == "/mock/clock" and method == "POST":
        OFFSET[0] += float(b.get("advance_seconds", 0))
        return 200, {"now": ts()}
    if path == "/mock/analytics":
        return 200, {"events": ST["analytics"]}
    if path == "/mock/logs":
        return 200, {"lines": ST["logs"]}
    if path == "/mock/deliveries":
        return 200, {"by_recipient": ST["deliveries"]}
    if path == "/mock/reset" and method == "POST":
        reset()
        return 200, {"reset": True}
    return E(404, "OLIP_NOT_FOUND", "Unknown hook.")


OPS_LIST = [("discover_providers", "GET", "/olip/v0.1/providers", "none"), ("get_professional_identity", "GET", "/olip/v0.1/professionals/{id}", "none"),
            ("get_intake_policy", "GET", "/olip/v0.1/professionals/{id}/intake-policy", "none"), ("prepare_or_validate_casebrief", "POST", "/olip/v0.1/casebriefs/validate", "client"),
            ("preview_handoff", "POST", "/olip/v0.1/handoff-previews", "client"), ("submit_approved_handoff", "POST", "/olip/v0.1/handoffs", "client"),
            ("get_handoff_status", "GET", "/olip/v0.1/handoffs/{id}", "client_or_recipient"), ("cancel_when_possible", "POST", "/olip/v0.1/handoffs/{id}/cancel", "client")]


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _go(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        n = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(n).decode("utf-8") if n else ""
        status = 500
        try:
            body = json.loads(raw) if raw else {}
            with LOCK:
                status, out = handle(self.command, u.path, q, body, {k.lower(): v for k, v in self.headers.items()})
        except json.JSONDecodeError:
            status, out = E(400, "OLIP_INVALID_REQUEST", "Bad JSON.")
        except Exception:
            status, out = E(500, "OLIP_INTERNAL", "Internal error.")
        with LOCK:
            ST["logs"].append(f"{ts()} {self.command} {re.sub(r'/(cbr|prv|hnd|auz|prf|frm)_[\w-]+', r'/\1_*', u.path)} {status}")
        data = out.encode("utf-8") if isinstance(out, str) else json.dumps(out).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "text/html; charset=utf-8" if isinstance(out, str) else "application/json; charset=utf-8")
        self.send_header("cache-control", "no-store")
        self.send_header("x-content-type-options", "nosniff")
        self.send_header("olip-version", V)
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    do_GET = do_POST = do_PUT = do_DELETE = _go


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8788"))
    print(f"OLIP alt mock server (Python, fictional data) on http://127.0.0.1:{port}", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
