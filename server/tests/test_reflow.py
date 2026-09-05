from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from conftest import same_origin

HERE = Path(__file__).parent
REVIEW = "rv_reflow1"
DOC = "doc_reflow1"


@pytest.fixture(scope="module")
def synthetic_pdf(tmp_path_factory) -> Path:
    out = tmp_path_factory.mktemp("synthetic")
    subprocess.run([sys.executable, str(HERE / "_synthetic_pdf.py")], cwd=out, check=True, capture_output=True)
    return out / "synthetic.pdf"


def wait_ready(client: TestClient, timeout: float = 60) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        s = client.get(f"/api/reviews/{REVIEW}/docs/{DOC}/reflow").json()
        if s["status"] in ("ready", "error"):
            return s
        time.sleep(0.2)
    raise AssertionError("reflow did not finish")


def test_upload_starts_reflow_and_doc_is_served(client: TestClient, synthetic_pdf: Path) -> None:
    client.post("/api/changes", json={"reviews": [{"id": REVIEW, "created_at": 1, "updated_at": 1}]}, headers=same_origin())
    up = client.put(f"/api/reviews/{REVIEW}/files/{DOC}", content=synthetic_pdf.read_bytes(), headers={**same_origin(), "Content-Type": "application/pdf"})
    assert up.status_code == 200
    status = wait_ready(client)
    assert status["status"] == "ready", status
    doc = client.get(f"/api/reviews/{REVIEW}/docs/{DOC}/reflow/doc.json").json()
    assert doc["pages"] == [1, 2, 3]
    heads = [b["text"] for b in doc["blocks"] if b["type"] == "heading"]
    assert "SPECIFIC AIMS" in heads and "RESEARCH STRATEGY" in heads
    assert any(b["type"] == "figure" for b in doc["blocks"])
    assert doc["toc"]
    fig = doc["figures"][0]
    img = client.get(f"/api/reviews/{REVIEW}/docs/{DOC}/reflow/{fig['src']}")
    assert img.status_code == 200 and img.headers["content-type"].startswith("image/")
    # Idempotent: asking again while ready does not restart.
    again = client.post(f"/api/reviews/{REVIEW}/docs/{DOC}/reflow", json={}, headers=same_origin()).json()
    assert again["status"] == "ready"


def test_reflow_404s_without_pdf(client: TestClient) -> None:
    r = client.post(f"/api/reviews/{REVIEW}/docs/doc_missing1/reflow", json={}, headers=same_origin())
    assert r.status_code == 404
    assert client.get(f"/api/reviews/{REVIEW}/docs/doc_missing1/reflow").json()["status"] == "none"
    assert client.get(f"/api/reviews/{REVIEW}/docs/{DOC}/reflow/figures/../../etc").status_code in (404, 400)
