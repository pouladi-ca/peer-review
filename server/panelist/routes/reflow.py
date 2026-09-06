"""The reading view: start, poll, and fetch a document's reflow."""

from __future__ import annotations

import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from ..auth import require_session
from ..config import Config
from ..db import DOC_ID_RE, REVIEW_ID_RE, Database
from ..reflow import ReflowManager
from ..users import User

router = APIRouter(prefix="/api", tags=["reflow"])

FIGURE_NAME_RE = re.compile(r"^[A-Za-z0-9_-]{1,40}\.(png|jpg)$")


class ReflowBody(BaseModel):
    pages: list[int] | None = Field(default=None, max_length=2000)
    force: bool = False


def _cfg(request: Request) -> Config:
    return request.app.state.config


def _mgr(request: Request) -> ReflowManager:
    return request.app.state.reflow


def _check(review_id: str, doc_id: str, request: Request | None = None, user: User | None = None) -> None:
    if not REVIEW_ID_RE.match(review_id) or not DOC_ID_RE.match(doc_id):
        raise HTTPException(status_code=404, detail="No such document")
    if request is not None and user is not None:
        db: Database = request.app.state.db
        with db.connect(write=False) as conn:
            row = conn.execute("SELECT owner_id FROM reviews WHERE id = ?", (review_id,)).fetchone()
        if row is None or row["owner_id"] != user.id:
            raise HTTPException(status_code=404, detail="No such document")


def start_reflow(request: Request, review_id: str, doc_id: str, pages: list[int] | None = None, force: bool = False) -> dict[str, Any]:
    cfg, mgr = _cfg(request), _mgr(request)
    review_dir = cfg.review_dir(review_id)
    pdf = review_dir / "files" / f"{doc_id}.pdf"
    if not pdf.is_file():
        raise HTTPException(status_code=404, detail="That PDF is not on the server yet.")
    status = mgr.status(review_dir, review_id, doc_id)
    if status["status"] in ("ready", "processing") and not force:
        return status
    mgr.start(review_dir, review_id, doc_id, pdf, pages)
    return mgr.status(review_dir, review_id, doc_id)


@router.post("/reviews/{review_id}/docs/{doc_id}/reflow")
def reflow_start(review_id: str, doc_id: str, body: ReflowBody, request: Request, user: User = Depends(require_session)) -> dict[str, Any]:
    _check(review_id, doc_id, request, user)
    return start_reflow(request, review_id, doc_id, body.pages, body.force)


@router.get("/reviews/{review_id}/docs/{doc_id}/reflow")
def reflow_status(review_id: str, doc_id: str, request: Request, user: User = Depends(require_session)) -> dict[str, Any]:
    # A review the server has not seen yet (its PDF is still uploading) and one that belongs
    # to someone else look the same: nothing to report.
    try:
        _check(review_id, doc_id, request, user)
    except HTTPException:
        return {"status": "none"}
    return _mgr(request).status(_cfg(request).review_dir(review_id), review_id, doc_id)


@router.get("/reviews/{review_id}/docs/{doc_id}/reflow/doc.json")
def reflow_doc(review_id: str, doc_id: str, request: Request, user: User = Depends(require_session)) -> FileResponse:
    _check(review_id, doc_id, request, user)
    path = ReflowManager.out_dir(_cfg(request).review_dir(review_id), doc_id) / "doc.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="The reading view is not ready.")
    return FileResponse(path, media_type="application/json", headers={"Cache-Control": "private, max-age=0"})


@router.get("/reviews/{review_id}/docs/{doc_id}/reflow/pages.json")
def reflow_pages(review_id: str, doc_id: str, request: Request, user: User = Depends(require_session)) -> FileResponse:
    """Positioned text per page for the browser's page view, extracted here so phones need not."""
    _check(review_id, doc_id, request, user)
    path = ReflowManager.out_dir(_cfg(request).review_dir(review_id), doc_id) / "pages.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="The page text is not ready.")
    return FileResponse(path, media_type="application/json", headers={"Cache-Control": "private, max-age=0"})


@router.get("/reviews/{review_id}/docs/{doc_id}/reflow/figures/{name}")
def reflow_figure(review_id: str, doc_id: str, name: str, request: Request, user: User = Depends(require_session)) -> FileResponse:
    _check(review_id, doc_id, request, user)
    if not FIGURE_NAME_RE.match(name):
        raise HTTPException(status_code=404, detail="No such figure")
    path = ReflowManager.out_dir(_cfg(request).review_dir(review_id), doc_id) / "figures" / name
    if not path.is_file():
        raise HTTPException(status_code=404, detail="No such figure")
    return FileResponse(path, headers={"Cache-Control": "private, max-age=86400"})
