"""Multi-line titles and headings are joined into one heading."""

from __future__ import annotations

from pathlib import Path

import pytest

from panelist.extract import build_document

SAMPLE = Path(__file__).resolve().parents[2] / "public" / "sample-application.pdf"


@pytest.mark.skipif(not SAMPLE.is_file(), reason="sample PDF not built")
def test_two_line_title_becomes_one_heading(tmp_path: Path) -> None:
    doc = build_document(SAMPLE, [1, 2], tmp_path)
    heads = [b["text"] for b in doc["blocks"] if b["type"] == "heading"]
    assert "Astrocyte-Derived Exosomal miR-133b as a Driver of Synaptic Repair After Ischemic Stroke" in heads
    assert not any(h.endswith("Driver of") for h in heads)
    titles = [t["title"] for t in doc["toc"]]
    assert "Specific Aims" in titles
    for b in doc["blocks"]:
        assert not any(k.startswith("_") for k in b)
