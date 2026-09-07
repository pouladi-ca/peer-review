"""Passkeys (WebAuthn): register this device, sign in with Face ID or Touch ID, manage them."""

from __future__ import annotations

import json
import secrets
import threading
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers import base64url_to_bytes, bytes_to_base64url
from webauthn.helpers.exceptions import InvalidAuthenticationResponse, InvalidRegistrationResponse
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)

from .. import users
from ..auth import SessionAuth, client_ip, require_session
from ..db import Database
from ..users import User
from .auth import me_payload

router = APIRouter(prefix="/api/passkeys", tags=["passkeys"])

CHALLENGE_TTL_S = 300
RP_NAME = "Panelist"


class _Challenges:
    """Short-lived challenges, keyed by a random id handed to the client."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._items: dict[str, tuple[float, bytes, str | None]] = {}

    def put(self, challenge: bytes, user_id: str | None) -> str:
        key = secrets.token_urlsafe(16)
        with self._lock:
            now = time.monotonic()
            for k, (exp, _, _) in list(self._items.items()):
                if exp < now:
                    del self._items[k]
            self._items[key] = (now + CHALLENGE_TTL_S, challenge, user_id)
        return key

    def pop(self, key: str) -> tuple[bytes, str | None] | None:
        with self._lock:
            item = self._items.pop(key, None)
        if item is None or item[0] < time.monotonic():
            return None
        return item[1], item[2]


CHALLENGES = _Challenges()


class RegisterBody(BaseModel):
    challenge_id: str = Field(alias="challengeId")
    credential: dict[str, Any]
    label: str = Field(default="", max_length=60)

    model_config = {"populate_by_name": True}


class LoginOptionsBody(BaseModel):
    email: str = Field(default="", max_length=254)


class LoginBody(BaseModel):
    challenge_id: str = Field(alias="challengeId")
    credential: dict[str, Any]

    model_config = {"populate_by_name": True}


def _db(request: Request) -> Database:
    return request.app.state.db


def _auth(request: Request) -> SessionAuth:
    return request.app.state.auth


def _rp(request: Request) -> tuple[str, str]:
    """The relying party id (the host without port) and the origin the browser will report."""
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or "localhost"
    rp_id = host.split(":")[0]
    scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
    return rp_id, f"{scheme}://{host}"


@router.post("/register/options")
def register_options(request: Request, user: User = Depends(require_session)) -> dict[str, Any]:
    rp_id, _ = _rp(request)
    with _db(request).connect(write=False) as conn:
        existing = users.list_passkeys(conn, user.id)
    options = generate_registration_options(
        rp_id=rp_id,
        rp_name=RP_NAME,
        user_id=user.id.encode(),
        user_name=user.email,
        user_display_name=user.email,
        exclude_credentials=[PublicKeyCredentialDescriptor(id=base64url_to_bytes(p.id)) for p in existing],
        authenticator_selection=AuthenticatorSelectionCriteria(resident_key=ResidentKeyRequirement.PREFERRED, user_verification=UserVerificationRequirement.PREFERRED),
    )
    challenge_id = CHALLENGES.put(options.challenge, user.id)
    return {"challengeId": challenge_id, "options": json.loads(options_to_json(options))}


@router.post("/register")
def register(body: RegisterBody, request: Request, user: User = Depends(require_session)) -> dict[str, Any]:
    rp_id, origin = _rp(request)
    item = CHALLENGES.pop(body.challenge_id)
    if item is None or item[1] != user.id:
        raise HTTPException(status_code=400, detail="That registration attempt expired; try again.")
    try:
        verified = verify_registration_response(credential=body.credential, expected_challenge=item[0], expected_rp_id=rp_id, expected_origin=origin)
    except InvalidRegistrationResponse as exc:
        raise HTTPException(status_code=400, detail=f"The passkey could not be verified: {exc}") from exc
    label = body.label.strip() or users.device_label(request.headers.get("user-agent", ""))
    transports = [str(t.value if hasattr(t, "value") else t) for t in (body.credential.get("response", {}).get("transports") or [])]
    with _db(request).connect() as conn:
        key = users.add_passkey(conn, user.id, bytes_to_base64url(verified.credential_id), verified.credential_public_key, verified.sign_count, transports, label)
    return {"passkey": key.public()}


@router.get("")
def list_keys(request: Request, user: User = Depends(require_session)) -> dict[str, Any]:
    with _db(request).connect(write=False) as conn:
        return {"passkeys": [p.public() for p in users.list_passkeys(conn, user.id)]}


@router.delete("/{cred_id}")
def delete_key(cred_id: str, request: Request, user: User = Depends(require_session)) -> dict[str, bool]:
    with _db(request).connect() as conn:
        if not users.delete_passkey(conn, cred_id, user.id):
            raise HTTPException(status_code=404, detail="No such passkey.")
    return {"ok": True}


@router.post("/login/options")
def login_options(body: LoginOptionsBody, request: Request) -> dict[str, Any]:
    """Options for signing in. With an email, only that account's passkeys are offered; without, any discoverable one."""
    rp_id, _ = _rp(request)
    allow: list[PublicKeyCredentialDescriptor] = []
    email = users.normalize_email(body.email) if body.email else None
    if email:
        with _db(request).connect(write=False) as conn:
            user = users.get_by_email(conn, email)
            keys = users.list_passkeys(conn, user.id) if user else []
        allow = [PublicKeyCredentialDescriptor(id=base64url_to_bytes(p.id)) for p in keys]
    options = generate_authentication_options(rp_id=rp_id, allow_credentials=allow, user_verification=UserVerificationRequirement.PREFERRED)
    challenge_id = CHALLENGES.put(options.challenge, None)
    return {"challengeId": challenge_id, "options": json.loads(options_to_json(options))}


@router.post("/login")
def login(body: LoginBody, request: Request, response: Response) -> dict[str, Any]:
    auth = _auth(request)
    ip = client_ip(request)
    if auth.limiter.retry_after(ip):
        raise HTTPException(status_code=429, detail="Too many sign-in attempts. Try again later.")
    rp_id, origin = _rp(request)
    item = CHALLENGES.pop(body.challenge_id)
    if item is None:
        raise HTTPException(status_code=400, detail="That sign-in attempt expired; try again.")
    cred_id = body.credential.get("id")
    if not isinstance(cred_id, str):
        raise HTTPException(status_code=400, detail="Malformed credential.")
    db = _db(request)
    with db.connect(write=False) as conn:
        key = users.get_passkey(conn, cred_id)
        user = users.get(conn, key.user_id) if key else None
    if key is None or user is None or user.disabled:
        auth.limiter.record_failure(ip)
        raise HTTPException(status_code=401, detail="That passkey is not registered here.")
    try:
        verified = verify_authentication_response(
            credential=body.credential,
            expected_challenge=item[0],
            expected_rp_id=rp_id,
            expected_origin=origin,
            credential_public_key=key.public_key,
            credential_current_sign_count=key.sign_count,
        )
    except InvalidAuthenticationResponse as exc:
        auth.limiter.record_failure(ip)
        raise HTTPException(status_code=401, detail=f"The passkey could not be verified: {exc}") from exc
    with db.connect() as conn:
        users.passkey_used(conn, key.id, verified.new_sign_count)
        users.touch_login(conn, user.id)
    auth.limiter.clear(ip)
    auth.sign_in(user, request, response)
    return me_payload(user)
