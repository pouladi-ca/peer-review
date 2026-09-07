"""Sign in with email and password, sign out, session probe, password change."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from .. import users
from ..auth import SessionAuth, client_ip, require_session
from ..db import Database
from ..users import MIN_PASSWORD_LENGTH, User

router = APIRouter(prefix="/api", tags=["auth"])


class LoginBody(BaseModel):
    email: str = Field(default="", max_length=254)
    password: str = Field(default="", max_length=1024)


class PasswordBody(BaseModel):
    current: str = Field(default="", max_length=1024)
    new: str = Field(default="", max_length=1024)


def _auth(request: Request) -> SessionAuth:
    return request.app.state.auth


def _db(request: Request) -> Database:
    return request.app.state.db


def me_payload(user: User) -> dict[str, Any]:
    return {"id": user.id, "email": user.email, "isAdmin": user.is_admin, "mustChangePassword": user.must_change}


@router.post("/login")
def login(body: LoginBody, request: Request, response: Response) -> dict[str, Any]:
    auth, db = _auth(request), _db(request)
    email = users.normalize_email(body.email) or ""
    keys = [client_ip(request)] + ([f"email:{email}"] if email else [])
    wait = max(auth.limiter.retry_after(k) for k in keys)
    if wait:
        minutes = -(-wait // 60)
        plural = "s" if minutes != 1 else ""
        raise HTTPException(
            status_code=429,
            detail=f"Too many sign-in attempts. Try again in {minutes} minute{plural}.",
            headers={"Retry-After": str(wait)},
        )
    with db.connect() as conn:
        user = users.get_by_email(conn, email) if email else None
        stored = users.password_hash_of(conn, user.id) if user else None
        ok = bool(user and stored and users.verify_password(stored, body.password))
        if not ok or user is None or user.disabled:
            for k in keys:
                auth.limiter.record_failure(k)
            if user is not None and user.disabled and ok:
                raise HTTPException(status_code=403, detail="This account has been disabled.")
            raise HTTPException(status_code=401, detail="That email or password is not right.")
        users.touch_login(conn, user.id)
    for k in keys:
        auth.limiter.clear(k)
    auth.sign_in(user, request, response)
    return me_payload(user)


@router.post("/logout")
def logout(request: Request, response: Response, user: User = Depends(require_session)) -> dict[str, bool]:
    auth = _auth(request)
    sid = auth.session_id(request)
    if sid:
        with _db(request).connect() as conn:
            users.revoke_session(conn, sid, user.id)
    auth.clear_cookie(response)
    return {"ok": True}


@router.get("/sessions")
def sessions(request: Request, user: User = Depends(require_session)) -> dict[str, Any]:
    """Every device signed in to this account, the current one flagged."""
    current = _auth(request).session_id(request)
    with _db(request).connect(write=False) as conn:
        rows = users.list_sessions(conn, user.id)
    return {"sessions": [{"id": s.id, "label": s.label, "createdAt": s.created_at, "lastSeenAt": s.last_seen_at, "current": s.id == current} for s in rows]}


@router.delete("/sessions/{session_id}")
def end_session(session_id: str, request: Request, response: Response, user: User = Depends(require_session)) -> dict[str, bool]:
    """Sign one device out. Ending the current session also clears this cookie."""
    with _db(request).connect() as conn:
        if not users.revoke_session(conn, session_id, user.id):
            raise HTTPException(status_code=404, detail="No such session.")
    if session_id == _auth(request).session_id(request):
        _auth(request).clear_cookie(response)
    return {"ok": True}


@router.post("/logout-everywhere")
def logout_everywhere(request: Request, response: Response, user: User = Depends(require_session)) -> dict[str, bool]:
    auth, db = _auth(request), _db(request)
    with db.connect() as conn:
        users.bump_generation(conn, user.id)
        users.revoke_all_sessions(conn, user.id)
    auth.clear_cookie(response)
    return {"ok": True}


@router.get("/me")
def me(user: User = Depends(require_session)) -> dict[str, Any]:
    return me_payload(user)


@router.post("/password")
def change_password(body: PasswordBody, request: Request, response: Response, user: User = Depends(require_session)) -> dict[str, Any]:
    """Set a new password. Every other device is signed out; this one gets a fresh cookie."""
    auth, db = _auth(request), _db(request)
    if len(body.new) < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"Use at least {MIN_PASSWORD_LENGTH} characters.")
    if body.new == body.current:
        raise HTTPException(status_code=400, detail="Choose a password you have not used here before.")
    with db.connect() as conn:
        stored = users.password_hash_of(conn, user.id)
        if not stored or not users.verify_password(stored, body.current):
            raise HTTPException(status_code=401, detail="Your current password is not right.")
        users.set_password(conn, user.id, body.new, must_change=False)
        fresh = users.get(conn, user.id)
    assert fresh is not None
    # A new generation ended every session; start a fresh one for this device.
    auth.sign_in(fresh, request, response)
    return me_payload(fresh)
