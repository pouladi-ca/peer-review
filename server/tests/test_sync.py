from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import same_origin

REVIEW = "rv_abc123"


def push(client: TestClient, **body):
    r = client.post("/api/changes", json=body, headers=same_origin())
    assert r.status_code == 200, r.text
    return r.json()


def pull(client: TestClient, since: int = 0):
    r = client.get(f"/api/changes?since={since}")
    assert r.status_code == 200
    return r.json()


def test_push_then_pull_roundtrip(client: TestClient) -> None:
    out = push(
        client,
        reviews=[{"id": REVIEW, "created_at": 1000, "updated_at": 1000}],
        records=[
            {"review_id": REVIEW, "key": "meta", "data": {"title": "T"}, "updated_at": 1000},
            {"review_id": REVIEW, "key": "score:importance", "data": {"score": 2, "comment": ""}, "updated_at": 1001},
        ],
        account=[{"key": "framework:custom-1", "data": {"name": "X"}, "updated_at": 1002}],
    )
    assert out["applied"] == 4
    seq = out["seq"]
    got = pull(client, 0)
    assert got["seq"] == seq
    assert [r["id"] for r in got["reviews"]] == [REVIEW]
    keys = {r["key"]: r["data"] for r in got["records"]}
    assert keys["meta"] == {"title": "T"}
    assert keys["score:importance"]["score"] == 2
    assert got["account"][0]["data"] == {"name": "X"}
    # Nothing new since the cursor.
    again = pull(client, seq)
    assert again["records"] == [] and again["reviews"] == [] and again["account"] == []


def test_last_writer_wins_per_record(client: TestClient) -> None:
    push(client, records=[{"review_id": REVIEW, "key": "meta", "data": {"title": "new"}, "updated_at": 2000}])
    stale = push(client, records=[{"review_id": REVIEW, "key": "meta", "data": {"title": "old"}, "updated_at": 1500}])
    assert stale["applied"] == 0
    assert {r["key"]: r["data"] for r in pull(client)["records"]}["meta"]["title"] == "new"
    # An equal timestamp (a retried push) is accepted, so a lost response converges.
    push(client, records=[{"review_id": REVIEW, "key": "meta", "data": {"title": "new"}, "updated_at": 2000}])


def test_tombstones_replicate(client: TestClient) -> None:
    push(client, records=[{"review_id": REVIEW, "key": "ann:a1", "data": {"quote": "q"}, "updated_at": 10}])
    seq = pull(client)["seq"]
    push(client, records=[{"review_id": REVIEW, "key": "ann:a1", "data": None, "updated_at": 20, "deleted": True}])
    got = pull(client, seq)
    assert got["records"][0]["deleted"] is True and got["records"][0]["data"] is None


def test_review_delete_tombstones_and_removes_files(client: TestClient) -> None:
    push(client, reviews=[{"id": REVIEW, "created_at": 1, "updated_at": 1}])
    up = client.put(f"/api/reviews/{REVIEW}/files/doc123456", content=b"%PDF-1.4 fake", headers={**same_origin(), "Content-Type": "application/pdf"})
    assert up.status_code == 200
    assert client.head(f"/api/reviews/{REVIEW}/files/doc123456").status_code == 200
    assert client.get(f"/api/reviews/{REVIEW}/files/doc123456").content.startswith(b"%PDF")
    seq = pull(client)["seq"]
    assert client.delete(f"/api/reviews/{REVIEW}", headers=same_origin()).status_code == 200
    got = pull(client, seq)
    assert got["reviews"][0]["deleted"] is True
    assert client.get(f"/api/reviews/{REVIEW}/files/doc123456").status_code == 404


def test_file_upload_rejects_non_pdf(client: TestClient) -> None:
    r = client.put(f"/api/reviews/{REVIEW}/files/doc123456", content=b"hello", headers={**same_origin(), "Content-Type": "application/pdf"})
    assert r.status_code == 400


def test_bad_ids_rejected(client: TestClient) -> None:
    r = client.post("/api/changes", json={"records": [{"review_id": "../x", "key": "meta", "data": {}, "updated_at": 1}]}, headers=same_origin())
    assert r.status_code == 400
    r = client.post("/api/changes", json={"records": [{"review_id": REVIEW, "key": "bad key!", "data": {}, "updated_at": 1}]}, headers=same_origin())
    assert r.status_code == 400
