"""User administration: list, invite, reset, disable, promote, delete. Admins only."""

from __future__ import annotations

import shutil
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from .. import users
from ..auth import require_admin
from ..config import Config
from ..db import Database
from ..users import User

router = APIRouter(prefix="/api/admin", tags=["admin"])


class CreateUserBody(BaseModel):
    email: str = Field(default="", max_length=254)
    is_admin: bool = Field(default=False, alias="isAdmin")

    model_config = {"populate_by_name": True}


class UpdateUserBody(BaseModel):
    disabled: bool | None = None
    is_admin: bool | None = Field(default=None, alias="isAdmin")

    model_config = {"populate_by_name": True}


def _db(request: Request) -> Database:
    return request.app.state.db


def _cfg(request: Request) -> Config:
    return request.app.state.config


@router.get("/users")
def list_users(request: Request, _admin: User = Depends(require_admin)) -> dict[str, Any]:
    with _db(request).connect(write=False) as conn:
        rows = users.list_all(conn)
    return {"users": [u.public() for u in rows]}


@router.post("/users")
def create_user(body: CreateUserBody, request: Request, _admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Invite someone: they get a temporary password and must choose their own at first sign-in."""
    email = users.normalize_email(body.email)
    if not email:
        raise HTTPException(status_code=400, detail="That does not look like an email address.")
    temp = users.temporary_password()
    with _db(request).connect() as conn:
        if users.get_by_email(conn, email) is not None:
            raise HTTPException(status_code=409, detail="Someone with that email already has an account.")
        user = users.create(conn, email, temp, is_admin=body.is_admin, must_change=True)
    return {"user": user.public(), "temporaryPassword": temp}


@router.post("/users/{user_id}/reset")
def reset_password(user_id: str, request: Request, _admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Issue a new temporary password and sign the person out of every device."""
    temp = users.temporary_password()
    with _db(request).connect() as conn:
        user = users.get(conn, user_id)
        if user is None:
            raise HTTPException(status_code=404, detail="No such user.")
        users.set_password(conn, user_id, temp, must_change=True)
        user = users.get(conn, user_id)
    assert user is not None
    return {"user": user.public(), "temporaryPassword": temp}


@router.patch("/users/{user_id}")
def update_user(user_id: str, body: UpdateUserBody, request: Request, admin: User = Depends(require_admin)) -> dict[str, Any]:
    if user_id == admin.id and (body.disabled or body.is_admin is False):
        raise HTTPException(status_code=400, detail="You cannot disable or demote your own account.")
    with _db(request).connect() as conn:
        if users.get(conn, user_id) is None:
            raise HTTPException(status_code=404, detail="No such user.")
        users.set_flags(conn, user_id, disabled=body.disabled, is_admin=body.is_admin)
        if body.disabled:
            users.bump_generation(conn, user_id)  # ends their sessions now, not at next check
        user = users.get(conn, user_id)
    assert user is not None
    return {"user": user.public()}


@router.delete("/users/{user_id}")
def delete_user(user_id: str, request: Request, admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Delete an account and every review, note, PDF, and custom framework it owns."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    cfg = _cfg(request)
    with _db(request).connect() as conn:
        if users.get(conn, user_id) is None:
            raise HTTPException(status_code=404, detail="No such user.")
        review_ids = users.delete(conn, user_id)
    for rid in review_ids:
        shutil.rmtree(cfg.review_dir(rid), ignore_errors=True)
    return {"ok": True, "reviewsRemoved": len(review_ids)}
