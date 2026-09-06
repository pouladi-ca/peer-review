"""The change feed: push records with last-writer-wins, pull everything since a sequence.

A client keeps a cursor (the last ``seq`` it saw). ``GET /api/changes?since=N`` returns every
review, record, and account record whose ``server_seq`` is greater than N, tombstones
included, plus the current sequence to store as the new cursor. ``POST /api/changes`` applies
a batch: a record is written when its client ``updated_at`` is newer than what the server
holds (ties go to the incoming write, so a retry after a lost response converges), and every
write gets a fresh ``server_seq``. Files (PDFs) are uploaded and fetched separately; their
existence travels through the ``doc:<id>`` records the client writes.
"""

from __future__ import annotations

import hashlib
import json
import shutil
import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from ..auth import require_session
from ..config import MAX_UPLOAD_BYTES, Config
from ..db import DOC_ID_RE, RECORD_KEY_RE, REVIEW_ID_RE, Database, current_seq, next_seq
from ..users import User

router = APIRouter(prefix="/api", tags=["sync"])

MAX_BATCH = 5000
MAX_RECORD_BYTES = 512 * 1024


class RecordIn(BaseModel):
    review_id: str = Field(max_length=40)
    key: str = Field(max_length=120)
    data: Any = None
    updated_at: int = Field(ge=0)
    deleted: bool = False


class AccountRecordIn(BaseModel):
    key: str = Field(max_length=120)
    data: Any = None
    updated_at: int = Field(ge=0)
    deleted: bool = False


class ReviewIn(BaseModel):
    id: str = Field(max_length=40)
    created_at: int = Field(ge=0)
    updated_at: int = Field(ge=0)
    deleted: bool = False


class ChangesIn(BaseModel):
    reviews: list[ReviewIn] = Field(default_factory=list)
    records: list[RecordIn] = Field(default_factory=list)
    account: list[AccountRecordIn] = Field(default_factory=list)


def _cfg(request: Request) -> Config:
    return request.app.state.config


def _db(request: Request) -> Database:
    return request.app.state.db


def _check_review_id(review_id: str) -> str:
    if not REVIEW_ID_RE.match(review_id):
        raise HTTPException(status_code=400, detail="Bad review id")
    return review_id


def _check_doc_id(doc_id: str) -> str:
    if not DOC_ID_RE.match(doc_id):
        raise HTTPException(status_code=400, detail="Bad document id")
    return doc_id


def _encode(data: Any) -> str:
    raw = json.dumps(data, separators=(",", ":"), ensure_ascii=False)
    if len(raw.encode()) > MAX_RECORD_BYTES:
        raise HTTPException(status_code=413, detail="A record was too large.")
    return raw


def _owner_of(conn: sqlite3.Connection, review_id: str) -> str | None:
    row = conn.execute("SELECT owner_id FROM reviews WHERE id = ?", (review_id,)).fetchone()
    return row["owner_id"] if row else None


def _ensure_review(conn: sqlite3.Connection, review_id: str, now_ms: int, seq: int, owner_id: str) -> None:
    """Create the review for its owner if it is new; refuse to touch another account's review."""
    conn.execute(
        "INSERT INTO reviews(id, created_at, updated_at, deleted, server_seq, owner_id) "
        "VALUES(?, ?, ?, 0, ?, ?) ON CONFLICT(id) DO NOTHING",
        (review_id, now_ms, now_ms, seq, owner_id),
    )
    if _owner_of(conn, review_id) != owner_id:
        raise HTTPException(status_code=403, detail="That review belongs to another account.")


def owned_review(conn: sqlite3.Connection, review_id: str, user: User) -> None:
    """404 unless the review exists and belongs to the user; nobody learns about other people's ids."""
    if _owner_of(conn, review_id) != user.id:
        raise HTTPException(status_code=404, detail="No such review")


@router.get("/changes")
def pull(request: Request, since: int = 0, user: User = Depends(require_session)) -> dict[str, Any]:
    db = _db(request)
    with db.connect(write=False) as conn:
        seq = current_seq(conn)
        reviews = [
            {
                "id": r["id"],
                "created_at": r["created_at"],
                "updated_at": r["updated_at"],
                "deleted": bool(r["deleted"]),
            }
            for r in conn.execute(
                "SELECT * FROM reviews WHERE owner_id = ? AND server_seq > ? ORDER BY server_seq", (user.id, since)
            )
        ]
        records = [
            {
                "review_id": r["review_id"],
                "key": r["key"],
                "data": json.loads(r["data"]) if not r["deleted"] else None,
                "updated_at": r["updated_at"],
                "deleted": bool(r["deleted"]),
            }
            for r in conn.execute(
                "SELECT records.* FROM records JOIN reviews ON reviews.id = records.review_id "
                "WHERE reviews.owner_id = ? AND records.server_seq > ? ORDER BY records.server_seq",
                (user.id, since),
            )
        ]
        account = [
            {
                "key": r["key"],
                "data": json.loads(r["data"]) if not r["deleted"] else None,
                "updated_at": r["updated_at"],
                "deleted": bool(r["deleted"]),
            }
            for r in conn.execute(
                "SELECT * FROM account_records WHERE owner_id = ? AND server_seq > ? ORDER BY server_seq",
                (user.id, since),
            )
        ]
    return {"seq": seq, "reviews": reviews, "records": records, "account": account}


@router.post("/changes")
def push(body: ChangesIn, request: Request, user: User = Depends(require_session)) -> dict[str, Any]:
    if len(body.records) + len(body.reviews) + len(body.account) > MAX_BATCH:
        raise HTTPException(status_code=413, detail="Too many changes in one batch.")
    db = _db(request)
    applied = 0
    with db.connect() as conn:
        for rv in body.reviews:
            _check_review_id(rv.id)
            row = conn.execute("SELECT updated_at, owner_id FROM reviews WHERE id = ?", (rv.id,)).fetchone()
            if row is not None and row["owner_id"] != user.id:
                raise HTTPException(status_code=403, detail="That review belongs to another account.")
            if row is not None and row["updated_at"] > rv.updated_at:
                continue
            seq = next_seq(conn)
            conn.execute(
                "INSERT INTO reviews(id, created_at, updated_at, deleted, server_seq, owner_id) "
                "VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET "
                "updated_at = excluded.updated_at, deleted = excluded.deleted, "
                "server_seq = excluded.server_seq",
                (rv.id, rv.created_at, rv.updated_at, int(rv.deleted), seq, user.id),
            )
            applied += 1
        for rec in body.records:
            _check_review_id(rec.review_id)
            if not RECORD_KEY_RE.match(rec.key):
                raise HTTPException(status_code=400, detail="Bad record key")
            row = conn.execute(
                "SELECT updated_at FROM records WHERE review_id = ? AND key = ?",
                (rec.review_id, rec.key),
            ).fetchone()
            if row is not None and row["updated_at"] > rec.updated_at:
                continue
            seq = next_seq(conn)
            _ensure_review(conn, rec.review_id, rec.updated_at, seq, user.id)
            conn.execute(
                "INSERT INTO records(review_id, key, data, updated_at, deleted, server_seq) "
                "VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(review_id, key) DO UPDATE SET "
                "data = excluded.data, updated_at = excluded.updated_at, "
                "deleted = excluded.deleted, server_seq = excluded.server_seq",
                (
                    rec.review_id,
                    rec.key,
                    _encode(rec.data) if not rec.deleted else "null",
                    rec.updated_at,
                    int(rec.deleted),
                    seq,
                ),
            )
            applied += 1
        for rec in body.account:
            if not RECORD_KEY_RE.match(rec.key):
                raise HTTPException(status_code=400, detail="Bad record key")
            row = conn.execute(
                "SELECT updated_at FROM account_records WHERE owner_id = ? AND key = ?", (user.id, rec.key)
            ).fetchone()
            if row is not None and row["updated_at"] > rec.updated_at:
                continue
            seq = next_seq(conn)
            conn.execute(
                "INSERT INTO account_records(owner_id, key, data, updated_at, deleted, server_seq) "
                "VALUES(?, ?, ?, ?, ?, ?) ON CONFLICT(owner_id, key) DO UPDATE SET data = excluded.data, "
                "updated_at = excluded.updated_at, deleted = excluded.deleted, "
                "server_seq = excluded.server_seq",
                (
                    user.id,
                    rec.key,
                    _encode(rec.data) if not rec.deleted else "null",
                    rec.updated_at,
                    int(rec.deleted),
                    seq,
                ),
            )
            applied += 1
        seq_now = current_seq(conn)
    return {"ok": True, "applied": applied, "seq": seq_now}


@router.delete("/reviews/{review_id}")
def delete_review(review_id: str, request: Request, user: User = Depends(require_session)) -> dict[str, Any]:
    """Tombstone a review and remove its files. Records are kept as tombstones."""
    _check_review_id(review_id)
    db, cfg = _db(request), _cfg(request)
    import time

    now_ms = int(time.time() * 1000)
    with db.connect() as conn:
        owned_review(conn, review_id, user)
        seq = next_seq(conn)
        conn.execute(
            "UPDATE reviews SET deleted = 1, updated_at = ?, server_seq = ? WHERE id = ?",
            (now_ms, seq, review_id),
        )
        conn.execute("DELETE FROM files WHERE review_id = ?", (review_id,))
    shutil.rmtree(cfg.review_dir(review_id), ignore_errors=True)
    return {"ok": True}


@router.put("/reviews/{review_id}/files/{doc_id}")
async def upload_file(review_id: str, doc_id: str, request: Request, user: User = Depends(require_session)) -> dict[str, Any]:
    """Store a PDF. The body is the raw file (``Content-Type: application/pdf``)."""
    _check_review_id(review_id)
    _check_doc_id(doc_id)
    cfg, db = _cfg(request), _db(request)
    import time

    # Claim the review for this account before anything touches the disk.
    with db.connect() as conn:
        _ensure_review(conn, review_id, int(time.time() * 1000), next_seq(conn), user.id)
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

    with db.connect() as conn:
        owned_review(conn, review_id, user)
        conn.execute(
            "INSERT INTO files(review_id, doc_id, size, sha256, uploaded_at) VALUES(?, ?, ?, ?, ?) "
            "ON CONFLICT(review_id, doc_id) DO UPDATE SET size = excluded.size, "
            "sha256 = excluded.sha256, uploaded_at = excluded.uploaded_at",
            (review_id, doc_id, size, digest.hexdigest(), int(time.time() * 1000)),
        )
    # Build the reading view straight away so a phone opening this review finds it ready.
    from .reflow import start_reflow

    try:
        start_reflow(request, review_id, doc_id, None, force=True)
    except Exception:  # noqa: BLE001 - the upload succeeded regardless
        pass
    return {"ok": True, "size": size, "sha256": digest.hexdigest()}


@router.get("/reviews/{review_id}/files/{doc_id}")
def download_file(review_id: str, doc_id: str, request: Request, user: User = Depends(require_session)) -> FileResponse:
    _check_review_id(review_id)
    _check_doc_id(doc_id)
    cfg = _cfg(request)
    with _db(request).connect(write=False) as conn:
        owned_review(conn, review_id, user)
    path = cfg.review_dir(review_id) / "files" / f"{doc_id}.pdf"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="No such file")
    return FileResponse(path, media_type="application/pdf", headers={"Cache-Control": "private, max-age=0"})


@router.head("/reviews/{review_id}/files/{doc_id}")
def file_exists(review_id: str, doc_id: str, request: Request, user: User = Depends(require_session)) -> dict[str, Any]:
    _check_review_id(review_id)
    _check_doc_id(doc_id)
    with _db(request).connect(write=False) as conn:
        owned_review(conn, review_id, user)
    path = _cfg(request).review_dir(review_id) / "files" / f"{doc_id}.pdf"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="No such file")
    return {"ok": True}
