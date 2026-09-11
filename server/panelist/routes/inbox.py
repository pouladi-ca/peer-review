"""The inbox: a PDF posted from a phone's share sheet becomes a new review.

Browsers that implement the Web Share Target standard post to the service worker, which
hands the file to the app. iOS Safari does not, so an iOS Shortcut posts the PDF here
with a per-account inbox token instead of the session cookie.
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from .. import users
from ..auth import SessionAuth, client_ip, require_session
from ..config import MAX_UPLOAD_BYTES, Config
from ..db import Database, next_seq
from ..users import User
from .reflow import start_reflow

router = APIRouter(prefix="/api/inbox", tags=["inbox"])

SAFE_NAME = re.compile(r"[^\w .()\-]+")


def _db(request: Request) -> Database:
    return request.app.state.db


def _cfg(request: Request) -> Config:
    return request.app.state.config


def _auth(request: Request) -> SessionAuth:
    return request.app.state.auth


def _new_id() -> str:
    return secrets.token_urlsafe(8)[:10]


@router.get("/token")
def token_status(request: Request, user: User = Depends(require_session)) -> dict[str, Any]:
    with _db(request).connect(write=False) as conn:
        return {"configured": users.has_inbox_token(conn, user.id)}


@router.post("/token")
def token_create(request: Request, user: User = Depends(require_session)) -> dict[str, Any]:
    """Mint a new inbox token (shown once); any previous token stops working."""
    token = users.inbox_token()
    with _db(request).connect() as conn:
        users.set_inbox_token(conn, user.id, token)
    return {"token": token}


@router.delete("/token")
def token_revoke(request: Request, user: User = Depends(require_session)) -> dict[str, bool]:
    with _db(request).connect() as conn:
        users.set_inbox_token(conn, user.id, None)
    return {"ok": True}


def _bearer_user(request: Request) -> User:
    auth = _auth(request)
    ip = client_ip(request)
    if auth.limiter.retry_after(f"inbox:{ip}"):
        raise HTTPException(status_code=429, detail="Too many attempts; try again later.")
    header = request.headers.get("authorization", "")
    token = header[7:].strip() if header.lower().startswith("bearer ") else ""
    user = None
    if token:
        with _db(request).connect(write=False) as conn:
            user = users.get_by_inbox_token(conn, token)
    if user is None or user.disabled:
        auth.limiter.record_failure(f"inbox:{ip}")
        raise HTTPException(status_code=401, detail="That inbox token is not valid.")
    return user


@router.post("")
async def inbox_post(request: Request, name: str = "application.pdf") -> dict[str, Any]:
    """Create a review from a raw PDF body. Auth: ``Authorization: Bearer <inbox token>``."""
    user = _bearer_user(request)
    cfg, db = _cfg(request), _db(request)
    clean = SAFE_NAME.sub("_", name).strip() or "application.pdf"
    if not clean.lower().endswith(".pdf"):
        clean += ".pdf"
    review_id, doc_id = _new_id(), _new_id()
    target_dir = cfg.review_dir(review_id) / "files"
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / f"{doc_id}.pdf"
    tmp = target.with_suffix(".pdf.part")
    digest = hashlib.sha256()
    size = 0
    with tmp.open("wb") as handle:
        first = True
        async for chunk in request.stream():
            if first:
                if not chunk.startswith(b"%PDF"):
                    handle.close()
                    tmp.unlink(missing_ok=True)
                    raise HTTPException(status_code=400, detail="That file is not a PDF.")
                first = False
            size += len(chunk)
            if size > MAX_UPLOAD_BYTES:
                handle.close()
                tmp.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="That PDF is too large.")
            digest.update(chunk)
            handle.write(chunk)
    if size == 0:
        tmp.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="Empty upload.")
    tmp.replace(target)

    now = int(time.time() * 1000)
    title = re.sub(r"\s+", " ", re.sub(r"[_.]+", " ", clean[:-4])).strip() or "Untitled review"
    meta = {"title": title, "frameworkId": "generic", "createdAt": now, "focusCriterionId": None}
    doc = {"id": doc_id, "name": clean, "size": size, "pages": 0, "addedAt": now, "role": "application"}
    with db.connect() as conn:
        seq = next_seq(conn)
        conn.execute(
            "INSERT INTO reviews(id, created_at, updated_at, deleted, server_seq, owner_id) VALUES(?, ?, ?, 0, ?, ?)",
            (review_id, now, now, seq, user.id),
        )
        for key, data in (("meta", meta), (f"doc:{doc_id}", doc)):
            conn.execute(
                "INSERT INTO records(review_id, key, data, updated_at, deleted, server_seq) VALUES(?, ?, ?, ?, 0, ?)",
                (review_id, key, json.dumps(data, separators=(",", ":")), now, next_seq(conn)),
            )
        conn.execute(
            "INSERT INTO files(review_id, doc_id, size, sha256, uploaded_at) VALUES(?, ?, ?, ?, ?)",
            (review_id, doc_id, size, digest.hexdigest(), now),
        )
    try:
        start_reflow(request, review_id, doc_id, None, force=True)
    except Exception:  # noqa: BLE001 - the review exists regardless
        pass
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or ""
    scheme = "https" if cfg.secure_cookies else request.url.scheme
    return {"reviewId": review_id, "title": title, "url": f"{scheme}://{host}/?open={review_id}"}
