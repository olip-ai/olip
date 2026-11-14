"""OLIP 2.0-draft lifecycle client and verifier for Python (standard library only).

PROPOSED draft, not adopted. Works with any OLIP 2.0-draft lifecycle host; needs no sponsor service.
Independent of the JavaScript reference code: it re-implements canonical JSON, digests, the grant digest,
zoned-time checks and webhook checks from the written rules, and is checked against vectors/golden-vectors.json.

Ed25519 verification uses the `cryptography` package when it is installed, otherwise the small pure-Python
RFC 8032 implementation shipped in this repository (protocol/alt-python/ed25519_pure.py). The pure version is
for tests and verification only; it is not constant-time and must never hold a real private key.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable

OLIP_V2 = "2.0-draft"
LIFECYCLE_EXTENSION = "olip.ai/lifecycle-capabilities/2.0-draft"
LIFECYCLE_PROFILES = ("olip-lifecycle-core/2", "olip-consultation/2", "olip-engagement/2", "olip-communications/2", "olip-matter/2")


class OlipError(Exception):
    def __init__(self, status: int, code: str, message: str, body: Any = None):
        super().__init__(f"{code}: {message}")
        self.status, self.code, self.message, self.body = status, code, message, body


# ---------- canonical JSON (OLIP 1.0 spec section 9.1, unchanged in 2.0-draft) ----------
def _utf16_key(k: str) -> bytes:
    return k.encode("utf-16-be")  # JavaScript sorts keys by UTF-16 code units, not by code points


def canonicalize(value: Any) -> str:
    if value is None or isinstance(value, bool):
        return json.dumps(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        raise ValueError("OLIP canonical JSON allows integers only")
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(canonicalize(v) for v in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value.keys(), key=_utf16_key)
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + canonicalize(value[k]) for k in keys) + "}"
    raise ValueError(f"unsupported value in canonical JSON: {type(value).__name__}")


def sha256_text(s: str) -> str:
    return "sha256:" + hashlib.sha256(s.encode("utf-8")).hexdigest()


def digest_of(value: Any) -> str:
    return sha256_text(canonicalize(value))


def bytes_digest(b: bytes) -> str:
    return "sha256:" + hashlib.sha256(b).hexdigest()


def grant_digest(g: dict) -> str:
    """The disclosure-grant digest: binds recipient, purpose, exact field paths and values, documents, content and expiry."""
    fields = sorted(({"path": f["path"], "value": f["value"]} for f in g.get("fields") or []), key=lambda f: _utf16_key(f["path"]))
    docs = sorted(({"document_id": d["document_id"], "sha256": d["sha256"]} for d in g.get("documents") or []), key=lambda d: _utf16_key(d["document_id"]))
    rec = g["recipient"]
    body = {"olip_version": OLIP_V2, "action": g["action"], "subject_id": g["subject_id"], "matter_id": g["matter_id"],
            "recipient": {k: v for k, v in {"organization_id": rec.get("organization_id"), "endpoint": rec.get("endpoint")}.items() if v is not None},
            "purpose": g["purpose"], "stage": g.get("stage"), "fields": fields, "documents": docs, "content_digest": g.get("content_digest"),
            "casebrief_revision": g.get("casebrief_revision"), "related_object_id": g.get("related_object_id"), "offer_digest": g.get("offer_digest"),
            "notice_version": g["notice_version"], "nonce": g["nonce"], "expires_at": g["expires_at"], "use": g["use"], "max_uses": g["max_uses"],
            "logistics_templates": g.get("logistics_templates")}
    return digest_of(body)


# ---------- Ed25519 detached signatures ----------
def _b64u_dec(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _ed25519_verify(public: bytes, msg: bytes, sig: bytes) -> bool:
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey  # type: ignore
        try:
            Ed25519PublicKey.from_public_bytes(public).verify(sig, msg)
            return True
        except Exception:
            return False
    except ImportError:
        here = os.path.dirname(os.path.abspath(__file__))
        alt = os.path.normpath(os.path.join(here, "..", "..", "..", "alt-python"))
        if alt not in sys.path:
            sys.path.insert(0, alt)
        import ed25519_pure  # type: ignore
        return bool(ed25519_pure.verify(public, msg, sig))


def verify_detached(obj: dict, keys: Iterable[dict]) -> dict:
    if not isinstance(obj, dict) or "signature" not in obj:
        return {"ok": False, "reason": "missing_signature"}
    sig = obj["signature"]
    if sig.get("alg") != "EdDSA":
        return {"ok": False, "reason": "unsupported_alg"}
    jwk = next((k for k in keys if k.get("kid") == sig.get("kid")), None)
    if jwk is None:
        return {"ok": False, "reason": "unknown_kid"}
    body = {k: v for k, v in obj.items() if k != "signature"}
    try:
        ok = _ed25519_verify(_b64u_dec(jwk["x"]), canonicalize(body).encode("utf-8"), _b64u_dec(str(sig.get("value", ""))))
    except Exception:
        ok = False
    return {"ok": True, "kid": jwk["kid"]} if ok else {"ok": False, "reason": "bad_signature"}


# ---------- times and webhooks ----------
def check_zoned_time(start_utc: str, tz: str, local_start: str | None = None) -> dict:
    import re
    try:
        from zoneinfo import ZoneInfo
        zone = ZoneInfo(tz)
    except Exception:
        return {"ok": False, "reason": "unknown_iana_timezone"}
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z", str(start_utc)):
        return {"ok": False, "reason": "start_utc_must_be_utc_rfc3339"}
    instant = datetime.fromisoformat(start_utc.replace("Z", "+00:00"))
    rendered = instant.astimezone(zone).strftime("%Y-%m-%dT%H:%M")
    if local_start is not None and str(local_start)[:16] != rendered:
        return {"ok": False, "reason": "local_time_does_not_match_utc_instant_in_zone", "expected_local": rendered}
    return {"ok": True, "local_start": rendered}


def _parse_ts(s: str) -> float:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()


def check_webhook(body: dict, host_keys: Iterable[dict], seen: set, now: str | None = None, max_skew_seconds: int = 300) -> dict:
    """Webhooks are hints only. Verify, reject stale or replayed ones, then read the status of record."""
    v = verify_detached(body, list(host_keys))
    if not v["ok"]:
        return v
    now_s = _parse_ts(now) if now else datetime.now(timezone.utc).timestamp()
    if abs(now_s - _parse_ts(body["sent_at"])) > max_skew_seconds:
        return {"ok": False, "reason": "stale_or_future_timestamp"}
    if body["webhook_id"] in seen:
        return {"ok": False, "reason": "replayed_webhook_id"}
    seen.add(body["webhook_id"])
    return {"ok": True}


def verify_journal(entries: list) -> dict:
    prev = "sha256:" + "0" * 64
    for e in entries:
        if e["prev_hash"] != prev:
            return {"ok": False, "seq": e["seq"], "reason": "broken_link"}
        h = digest_of({"seq": e["seq"], "recorded_at": e["recorded_at"], "prev_hash": e["prev_hash"], "event": e["event"]})
        if h != e["entry_hash"]:
            return {"ok": False, "seq": e["seq"], "reason": "entry_hash_mismatch"}
        prev = h
    return {"ok": True, "length": len(entries)}


def engagement_status_text(e: dict) -> str:
    """Display text for an engagement. Never stronger than the evidence."""
    if e.get("state") == "firm_confirmed":
        ds = e.get("display_status") or {}
        return f"{ds.get('text', 'Firm reports engagement confirmed')}. {ds.get('qualifier', '')}".strip()
    return (e.get("display_status") or {}).get("text") or f"Status: {e.get('state')}"


# ---------- HTTP client ----------
class LifecycleClient:
    """One instance per host. Tokens are held in memory only."""

    def __init__(self, base: str, timeout: float = 10.0):
        self.base, self.timeout, self.token, self.caps = base.rstrip("/"), timeout, None, None

    def request(self, method: str, path: str, body: Any = None, headers: dict | None = None) -> tuple[int, Any]:
        h = {"accept": "application/json", **(headers or {})}
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            h["content-type"] = "application/json"
        if self.token and "authorization" not in h:
            h["authorization"] = f"Bearer {self.token}"
        if method != "GET" and "idempotency-key" not in h:
            h["idempotency-key"] = str(uuid.uuid4())
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as r:
                status, raw = r.status, r.read()
        except urllib.error.HTTPError as e:
            status, raw = e.code, e.read()
        try:
            parsed = json.loads(raw.decode("utf-8")) if raw else None
        except ValueError:
            parsed = raw.decode("utf-8", "replace")
        return status, parsed

    def must(self, method: str, path: str, body: Any = None, headers: dict | None = None) -> Any:
        status, b = self.request(method, path, body, headers)
        if status >= 400:
            err = (b or {}).get("error") if isinstance(b, dict) else None
            code = err.get("code") if isinstance(err, dict) else "OLIP_HTTP_ERROR"
            msg = err.get("message") if isinstance(err, dict) else f"HTTP {status}"
            raise OlipError(status, code, msg, b)
        return b

    def negotiate(self) -> dict:
        s1, v1 = self.request("GET", "/.well-known/olip.json")
        s2, lc = self.request("GET", "/.well-known/olip-lifecycle.json")
        advertised = s1 == 200 and LIFECYCLE_EXTENSION in (v1 or {}).get("extensions_supported", [])
        if s2 == 200 and isinstance(lc, dict) and lc.get("olip_version") == OLIP_V2 and (advertised or s1 != 200):
            self.caps = {"lifecycle": True, "profiles": [p for p in lc.get("profiles", []) if p in LIFECYCLE_PROFILES], "statement": lc.get("statement")}
        else:
            self.caps = {"lifecycle": False, "profiles": [], "olip1_versions": (v1 or {}).get("supported_versions", []) if s1 == 200 else [],
                         "statement": "This endpoint offers no OLIP 2.0-draft lifecycle profiles. Use only its OLIP 1.0 operations."}
        return self.caps

    def _need(self, profile: str) -> None:
        if self.caps is None:
            raise OlipError(0, "OLIP_NOT_NEGOTIATED", "Call negotiate() first.")
        if not self.caps["lifecycle"] or profile not in self.caps["profiles"]:
            raise OlipError(0, "OLIP_PROFILE_NOT_SUPPORTED", f"The endpoint does not offer {profile}. Not calling it.")

    # identity
    def user_session(self, subject_id: str, password: str) -> dict:
        self.token = None
        r = self.must("POST", "/olip/v2/user-sessions", {"subject_id": subject_id, "password": password})
        self.token = r["session_token"]
        return r

    def delegate_agent(self, client_id: str, content_access: bool = False) -> dict:
        return self.must("POST", "/olip/v2/agent-delegations", {"client_id": client_id, "content_access": content_access})

    def agent_token(self, client_id: str, client_secret: str, code: str) -> dict:
        self.token = None
        r = self.must("POST", "/olip/v2/token", {"grant_type": "urn:olip:params:oauth:grant-type:delegation_code", "client_id": client_id, "client_secret": client_secret, "code": code})
        self.token = r["access_token"]
        return r

    # lifecycle (assistant side)
    def recipients(self, **q) -> dict:
        self._need("olip-lifecycle-core/2")
        from urllib.parse import urlencode
        return self.must("GET", "/olip/v2/recipients?" + urlencode(q))

    def create_matter(self, casebrief: dict, fictional: bool = True) -> dict:
        self._need("olip-lifecycle-core/2")
        return self.must("POST", "/olip/v2/matters", {"casebrief": casebrief, "fictional": fictional})

    def get_matter(self, matter_id: str) -> dict:
        self._need("olip-lifecycle-core/2")
        return self.must("GET", f"/olip/v2/matters/{matter_id}")

    def request_conflict_screen(self, matter_id: str, organization_id: str, fields: list) -> dict:
        self._need("olip-lifecycle-core/2")
        return self.must("POST", f"/olip/v2/matters/{matter_id}/conflict-screens", {"organization_id": organization_id, "fields": fields, "selection": {"by": "user"}})

    def submit_conflict_screen(self, screen_id: str, approval: dict) -> dict:
        self._need("olip-lifecycle-core/2")
        return self.must("POST", f"/olip/v2/conflict-screens/{screen_id}/submit", {"grant_id": approval["grant_id"], "grant_digest": approval["grant_digest"]})

    def get_engagement(self, engagement_id: str) -> dict:
        self._need("olip-engagement/2")
        return self.must("GET", f"/olip/v2/engagements/{engagement_id}")

    def events(self, matter_id: str) -> dict:
        self._need("olip-lifecycle-core/2")
        return self.must("GET", f"/olip/v2/matters/{matter_id}/events")

    def host_keys(self) -> list:
        return self.must("GET", "/olip/v2/keys")["keys"]

    # user-only (call with a USER session token, never an agent token)
    def get_approval(self, approval_id: str) -> dict:
        return self.must("GET", f"/olip/v2/approvals/{approval_id}")

    def decide(self, approval_id: str, decision: str, otp: str, grant_digest_value: str) -> dict:
        return self.must("POST", f"/olip/v2/approvals/{approval_id}/decision", {"decision": decision, "otp": otp, "grant_digest": grant_digest_value})

    def export_passport(self, matter_id: str) -> dict:
        self._need("olip-matter/2")
        return self.must("POST", f"/olip/v2/matters/{matter_id}/exports", {})
