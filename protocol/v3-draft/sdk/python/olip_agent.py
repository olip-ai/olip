"""OLIP 3.0-draft agent client and verifier for Python (standard library; optional `cryptography`).

PROPOSED draft, not adopted. Works with any OLIP 3.0-draft host; needs no sponsor account or service.
Canonical JSON and Ed25519 verification are reused from the 2.0-draft Python client (same written rules as OLIP 1.0).
Everything 3.0-specific (journal chain, capsule digest, webhooks, plan digest, sealed capsules) is implemented here
separately from the JavaScript reference and checked against vectors/v3-vectors.json.

Opening an encrypted capsule needs X25519, HKDF and AES-GCM, which the standard library does not have; it uses the
`cryptography` package when installed and otherwise reports that it cannot decrypt (it never guesses).
"""
from __future__ import annotations

import base64
import json
import os
import sys
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable

_here = os.path.dirname(os.path.abspath(__file__))
_v2 = os.path.normpath(os.path.join(_here, "..", "..", "..", "v2-draft", "sdk", "python"))
if _v2 not in sys.path:
    sys.path.insert(0, _v2)
from olip_lifecycle import canonicalize, sha256_text, verify_detached  # noqa: E402  (2.0-draft client, unchanged)

OLIP_V3 = "3.0-draft.1"
ZERO_DIGEST = "sha256:" + "0" * 64


def digest_of(value: Any) -> str:
    return sha256_text(canonicalize(value))


def _b64u_dec(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


class OlipError(Exception):
    def __init__(self, status: int, code: str, message: str, body: Any = None):
        super().__init__(f"{code}: {message}")
        self.status, self.code, self.message, self.body = status, code, message, body


def verify_journal(entries: Iterable[dict], keys: list, previous_digest: str = ZERO_DIGEST) -> dict:
    prev = previous_digest
    for e in entries:
        rest = {k: v for k, v in e.items() if k not in ("signature", "event_digest")}
        if e.get("previous_event_digest") != prev:
            return {"ok": False, "at": e.get("sequence"), "reason": "chain_gap", "last_digest": prev}
        if digest_of(rest) != e.get("event_digest"):
            return {"ok": False, "at": e.get("sequence"), "reason": "digest_mismatch", "last_digest": prev}
        if not verify_detached(e, keys)["ok"]:
            return {"ok": False, "at": e.get("sequence"), "reason": "bad_signature", "last_digest": prev}
        prev = e["event_digest"]
    return {"ok": True, "last_digest": prev}


def verify_capsule(capsule: dict, issuer_keys: list, now: datetime | None = None) -> dict:
    problems = []
    body = {k: v for k, v in capsule.items() if k not in ("signature", "capsule_digest")}
    if digest_of(body) != capsule.get("capsule_digest"):
        problems.append("capsule_digest_mismatch")
    v = verify_detached(capsule, issuer_keys)
    if not v["ok"]:
        problems.append("signature_" + v.get("reason", "bad"))
    exp = capsule.get("expires_at")
    now = now or datetime.now(timezone.utc)
    if not exp or datetime.fromisoformat(exp.replace("Z", "+00:00")) <= now:
        problems.append("expired")
    ea = capsule.get("export_authorization") or {}
    if ea and (ea.get("onward_disclosure") is not False or ea.get("authorizes_recipients")):
        problems.append("capsule_claims_disclosure_authority")
    return {"ok": not problems, "problems": problems}


def open_sealed_capsule(capsule: dict, recipient_private_d: str, recipient_public_x: str) -> dict:
    try:
        from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey  # type: ignore
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM  # type: ignore
        from cryptography.hazmat.primitives.kdf.hkdf import HKDF  # type: ignore
        from cryptography.hazmat.primitives import hashes  # type: ignore
    except ImportError as e:  # pragma: no cover
        raise OlipError(0, "DECRYPT_UNAVAILABLE", "the `cryptography` package is not installed; cannot open a sealed capsule") from e
    env = capsule["sealed_content"]
    priv = X25519PrivateKey.from_private_bytes(_b64u_dec(recipient_private_d))
    shared = priv.exchange(X25519PublicKey.from_public_bytes(_b64u_dec(env["epk"]["x"])))
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=(env["epk"]["x"] + "." + recipient_public_x).encode(), info=b"olip-3.0-draft capsule").derive(shared)
    plain = AESGCM(key).decrypt(_b64u_dec(env["iv"]), _b64u_dec(env["ciphertext"]) + _b64u_dec(env["tag"]), env["aad"].encode())
    content = json.loads(plain.decode("utf-8"))
    want = (capsule.get("encryption") or {}).get("content_digest")
    if want and digest_of(content) != want:
        raise OlipError(0, "UNVERIFIED_EVIDENCE", "decrypted content does not match content_digest")
    return content


def check_webhook(body: dict, keys: list, seen: set, now: datetime | None = None, max_skew_seconds: int = 300) -> dict:
    v = verify_detached(body, keys)
    if not v["ok"]:
        return {"ok": False, "reason": v.get("reason")}
    now = now or datetime.now(timezone.utc)
    sent = datetime.fromisoformat(body["sent_at"].replace("Z", "+00:00"))
    if abs((now - sent).total_seconds()) > max_skew_seconds:
        return {"ok": False, "reason": "stale"}
    if body["webhook_id"] in seen:
        return {"ok": False, "reason": "duplicate"}
    seen.add(body["webhook_id"])
    return {"ok": True}


class AgentClient:
    """Calls a 3.0-draft host. It holds an agent token; it can never approve anything or sign for a firm."""

    def __init__(self, base: str, token: str | None = None):
        self.base, self.token = base.rstrip("/"), token

    def request(self, method: str, path: str, body: Any = None, headers: dict | None = None) -> tuple[int, Any]:
        h = {"accept": "application/json", **(headers or {})}
        if body is not None:
            h["content-type"] = "application/json"
        if self.token:
            h["authorization"] = "Bearer " + self.token
        req = urllib.request.Request(self.base + path, method=method, headers=h, data=None if body is None else json.dumps(body).encode())
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                text = r.read().decode()
                return r.status, json.loads(text) if text else None
        except urllib.error.HTTPError as e:
            text = e.read().decode()
            try:
                return e.code, json.loads(text)
            except ValueError:
                return e.code, text

    def _must(self, method: str, path: str, body: Any = None, headers: dict | None = None) -> Any:
        status, out = self.request(method, path, body, headers)
        if status >= 400:
            err = (out or {}).get("error", {}) if isinstance(out, dict) else {}
            raise OlipError(status, err.get("code", f"HTTP_{status}"), err.get("message", "request failed"), out)
        return out

    def invoke(self, action_id: str, inp: dict | None = None, idempotency_key: str | None = None) -> Any:
        headers = {"olip-version": OLIP_V3, "idempotency-key": idempotency_key or ("py-" + uuid.uuid4().hex)}
        return self._must("POST", f"/olip/v3/actions/{action_id}/invoke", inp or {}, headers)

    def manifest(self) -> dict:
        return self._must("GET", "/.well-known/olip-agent.json")

    def keys(self) -> list:
        return self._must("GET", "/olip/v3/keys")["keys"]

    def plan(self, workflow_id: str, goal: str | None = None) -> dict:
        return self.invoke("olip.plan_next_actions", {"workflow_id": workflow_id, **({"desired_goal": goal} if goal else {})})

    def resume(self, workflow_id: str, cursor: str | None = None, last_digest: str | None = None) -> dict:
        keys, out = self.keys(), []
        while True:
            inp = {"workflow_id": workflow_id, **({"cursor": cursor} if cursor else {}), **({"last_seen_digest": last_digest} if last_digest else {})}
            page = self.invoke("olip.list_workflow_events", inp)
            v = verify_journal(page["entries"], keys, last_digest or ZERO_DIGEST)
            if not v["ok"]:
                raise OlipError(0, "UNVERIFIED_EVIDENCE", f"journal did not verify at {v.get('at')}: {v.get('reason')}")
            out += page["entries"]
            cursor, last_digest = page["next_cursor"], v["last_digest"]
            if not page["has_more"]:
                return {"entries": out, "cursor": cursor, "last_digest": last_digest}
