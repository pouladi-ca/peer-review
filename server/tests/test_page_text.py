"""The extractor emits per-page positioned text in the shape the browser's page view expects."""

from __future__ import annotations

from pathlib import Path

import pytest

from panelist.extract import build_document

SAMPLE = Path(__file__).resolve().parents[2] / "public" / "sample-application.pdf"


@pytest.mark.skipif(not SAMPLE.is_file(), reason="sample PDF not built")
def test_page_text_matches_client_invariants(tmp_path: Path) -> None:
    doc = build_document(SAMPLE, [1, 2], tmp_path)
    pages = doc["pageText"]
    assert [p["page"] for p in pages] == [1, 2]
    first = pages[0]
    assert first["width"] > 0 and first["height"] > 0
    assert "Astrocyte-Derived" in first["text"]
    # Every line's text is its runs joined by single spaces, which is what offset mapping relies on.
    for p in pages:
        assert p["text"] == "\n".join(ln["text"] for ln in p["lines"])
        for i, ln in enumerate(p["lines"]):
            runs = [r for r in p["runs"] if r["line"] == i]
            assert runs, "every line has at least one run"
            assert ln["text"] == " ".join(r["str"] for r in runs)
        for r in p["runs"]:
            assert 0 <= r["x"] <= 1 and 0 <= r["y"] <= 1
            assert 0 < r["w"] <= 1 and 0 < r["h"] <= 1
            assert r["str"] == r["str"].strip() and r["str"]
    # Reading order: the title comes before the abstract on page 1.
    assert first["text"].index("Astrocyte-Derived") < first["text"].index("Abstract")
