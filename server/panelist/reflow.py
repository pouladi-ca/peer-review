"""Background reflow: one worker thread per document, with pollable progress.

The extractor (`extract.build_document`, shared with Marginalia) turns a PDF into
``doc.json`` plus figure images under ``<review>/reflow/<doc>/``. State is derived from
the file system so it survives restarts: ``doc.json`` present means ready, ``error.txt``
means the last run failed, a live thread means processing, and nothing means not started.
"""

from __future__ import annotations

import json
import logging
import shutil
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .extract import build_document, progress_total

log = logging.getLogger("panelist.reflow")

FAILED = "The reading view could not be built for this PDF."


@dataclass(slots=True)
class Progress:
    done: int = 0
    total: int = 0
    message: str = ""


class ReflowManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._progress: dict[str, Progress] = {}
        self._threads: dict[str, threading.Thread] = {}

    @staticmethod
    def out_dir(review_dir: Path, doc_id: str) -> Path:
        return review_dir / "reflow" / doc_id

    def _key(self, review_id: str, doc_id: str) -> str:
        return f"{review_id}/{doc_id}"

    def is_running(self, review_id: str, doc_id: str) -> bool:
        with self._lock:
            t = self._threads.get(self._key(review_id, doc_id))
        return t is not None and t.is_alive()

    def status(self, review_dir: Path, review_id: str, doc_id: str) -> dict[str, Any]:
        out = self.out_dir(review_dir, doc_id)
        if self.is_running(review_id, doc_id):
            with self._lock:
                p = self._progress.get(self._key(review_id, doc_id), Progress())
            return {"status": "processing", "done": p.done, "total": p.total, "message": p.message}
        if (out / "doc.json").is_file():
            return {"status": "ready"}
        if (out / "error.txt").is_file():
            return {"status": "error", "error": FAILED}
        return {"status": "none"}

    def start(self, review_dir: Path, review_id: str, doc_id: str, pdf_path: Path, pages: list[int] | None) -> None:
        key = self._key(review_id, doc_id)
        with self._lock:
            existing = self._threads.get(key)
            if existing is not None and existing.is_alive():
                return
            self._progress[key] = Progress(0, progress_total(pages or []), "Starting")
            thread = threading.Thread(target=self._run, args=(review_dir, review_id, doc_id, pdf_path, pages), name=f"reflow-{doc_id}", daemon=True)
            self._threads[key] = thread
        thread.start()

    def _report(self, key: str, done: int, total: int, message: str) -> None:
        with self._lock:
            self._progress[key] = Progress(done, total, message)

    def _run(self, review_dir: Path, review_id: str, doc_id: str, pdf_path: Path, pages: list[int] | None) -> None:
        key = self._key(review_id, doc_id)
        out = self.out_dir(review_dir, doc_id)
        try:
            import pymupdf

            with pymupdf.open(str(pdf_path)) as pdf:
                page_list = pages or list(range(1, len(pdf) + 1))
            out.mkdir(parents=True, exist_ok=True)
            (out / "error.txt").unlink(missing_ok=True)
            figures = out / "figures"
            if figures.exists():
                shutil.rmtree(figures)
            doc = build_document(pdf_path, page_list, out, lambda d, t, m: self._report(key, d, t, m))
            tmp = out / "doc.json.tmp"
            tmp.write_text(json.dumps(doc), encoding="utf-8")
            tmp.replace(out / "doc.json")
            self._report(key, progress_total(page_list), progress_total(page_list), "Done")
        except Exception:  # noqa: BLE001
            log.exception("reflow failed for %s", key)
            out.mkdir(parents=True, exist_ok=True)
            (out / "error.txt").write_text(FAILED, encoding="utf-8")
            (out / "doc.json").unlink(missing_ok=True)
