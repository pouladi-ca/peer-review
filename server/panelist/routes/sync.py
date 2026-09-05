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

router = APIRouter(prefix="/api", tags=["sync"], dependencies=[Depends(require_session)])

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


def _ensure_review(conn: sqlite3.Connection, review_id: str, now_ms: int, seq: int) -> None:
    conn.execute(
        "INSERT INTO reviews(id, created_at, updated_at, deleted, server_seq) "
        "VALUES(?, ?, ?, 0, ?) ON CONFLICT(id) DO NOTHING",
        (review_id, now_ms, now_ms, seq),
    )


@router.get("/changes")
def pull(request: Request, since: int = 0) -> dict[str, Any]:
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
                "SELECT * FROM reviews WHERE server_seq > ? ORDER BY server_seq", (since,)
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
                "SELECT * FROM records WHERE server_seq > ? ORDER BY server_seq", (since,)
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
                "SELECT * FROM account_records WHERE server_seq > ? ORDER BY server_seq",
                (since,),
            )
        ]
    return {"seq": seq, "reviews": reviews, "records": records, "account": account}


@router.post("/changes")
def push(body: ChangesIn, request: Request) -> dict[str, Any]:
    if len(body.records) + len(body.reviews) + len(body.account) > MAX_BATCH:
        raise HTTPException(status_code=413, detail="Too many changes in one batch.")
    db = _db(request)
    applied = 0
    with db.connect() as conn:
        for rv in body.reviews:
            _check_review_id(rv.id)
            row = conn.execute("SELECT updated_at FROM reviews WHERE id = ?", (rv.id,)).fetchone()
            if row is not None and row["updated_at"] > rv.updated_at:
                continue
            seq = next_seq(conn)
            conn.execute(
                "INSERT INTO reviews(id, created_at, updated_at, deleted, server_seq) "
                "VALUES(?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET "
                "updated_at = excluded.updated_at, deleted = excluded.deleted, "
                "server_seq = excluded.server_seq",
                (rv.id, rv.created_at, rv.updated_at, int(rv.deleted), seq),
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
            _ensure_review(conn, rec.review_id, rec.updated_at, seq)
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
                "SELECT updated_at FROM account_records WHERE key = ?", (rec.key,)
            ).fetchone()
            if row is not None and row["updated_at"] > rec.updated_at:
                continue
            seq = next_seq(conn)
            conn.execute(
                "INSERT INTO account_records(key, data, updated_at, deleted, server_seq) "
                "VALUES(?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET data = excluded.data, "
                "updated_at = excluded.updated_at, deleted = excluded.deleted, "
                "server_seq = excluded.server_seq",
                (
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
def delete_review(review_id: str, request: Request) -> dict[str, Any]:
    """Tombstone a review and remove its files. Records are kept as tombstones."""
    _check_review_id(review_id)
    db, cfg = _db(request), _cfg(request)
    import time

    now_ms = int(time.time() * 1000)
    with db.connect() as conn:
        seq = next_seq(conn)
        conn.execute(
            "INSERT INTO reviews(id, created_at, updated_at, deleted, server_seq) "
            "VALUES(?, ?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET deleted = 1, "
            "updated_at = excluded.updated_at, server_seq = excluded.server_seq",
            (review_id, now_ms, now_ms, seq),
        )
        conn.execute("DELETE FROM files WHERE review_id = ?", (review_id,))
    shutil.rmtree(cfg.review_dir(review_id), ignore_errors=True)
    return {"ok": True}


@router.put("/reviews/{review_id}/files/{doc_id}")
async def upload_file(review_id: str, doc_id: str, request: Request) -> dict[str, Any]:
    """Store a PDF. The body is the raw file (``Content-Type: application/pdf``)."""
    _check_review_id(review_id)
    _check_doc_id(doc_id)
    cfg, db = _cfg(request), _db(request)
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
    import time

    with db.connect() as conn:
        seq = next_seq(conn)
        _ensure_review(conn, review_id, int(time.time() * 1000), seq)
        conn.execute(
            "INSERT INTO files(review_id, doc_id, size, sha256, uploaded_at) VALUES(?, ?, ?, ?, ?) "
            "ON CONFLICT(review_id, doc_id) DO UPDATE SET size = excluded.size, "
            "sha256 = excluded.sha256, uploaded_at = excluded.uploaded_at",
            (review_id, doc_id, size, digest.hexdigest(), int(time.time() * 1000)),
        )
    return {"ok": True, "size": size, "sha256": digest.hexdigest()}


@router.get("/reviews/{review_id}/files/{doc_id}")
def download_file(review_id: str, doc_id: str, request: Request) -> FileResponse:
    _check_review_id(review_id)
    _check_doc_id(doc_id)
    cfg = _cfg(request)
    path = cfg.review_dir(review_id) / "files" / f"{doc_id}.pdf"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="No such file")
    return FileResponse(path, media_type="application/pdf", headers={"Cache-Control": "private, max-age=0"})


@router.head("/reviews/{review_id}/files/{doc_id}")
def file_exists(review_id: str, doc_id: str, request: Request) -> dict[str, Any]:
    _check_review_id(review_id)
    _check_doc_id(doc_id)
    path = _cfg(request).review_dir(review_id) / "files" / f"{doc_id}.pdf"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="No such file")
    return {"ok": True}
