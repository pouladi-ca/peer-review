"""A PDF posted with an inbox token becomes a review the owner can sync."""

from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import same_origin

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def test_inbox_token_lifecycle_and_post(client: TestClient, anon: TestClient) -> None:
    assert client.get("/api/inbox/token").json() == {"configured": False}
    token = client.post("/api/inbox/token", headers=same_origin()).json()["token"]
    assert client.get("/api/inbox/token").json() == {"configured": True}
    # No session, no origin: the token alone authenticates, as a phone Shortcut would send it.
    r = anon.post("/api/inbox?name=My%20Grant.pdf", content=PDF, headers={"Authorization": f"Bearer {token}", "Content-Type": "application/pdf"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["title"] == "My Grant" and body["url"].endswith(f"/?open={body['reviewId']}")
    got = client.get("/api/changes?since=0").json()
    assert [x["id"] for x in got["reviews"]] == [body["reviewId"]]
    keys = {x["key"]: x["data"] for x in got["records"]}
    assert keys["meta"]["title"] == "My Grant"
    doc = next(v for k, v in keys.items() if k.startswith("doc:"))
    assert doc["name"] == "My Grant.pdf" and doc["role"] == "application"
    assert client.head(f"/api/reviews/{body['reviewId']}/files/{doc['id']}").status_code == 200
    # Bad tokens and non-PDFs are refused; a revoked token stops working.
    assert anon.post("/api/inbox", content=PDF, headers={"Authorization": "Bearer nope"}).status_code == 401
    assert anon.post("/api/inbox", content=b"hello", headers={"Authorization": f"Bearer {token}"}).status_code == 400
    assert client.delete("/api/inbox/token", headers=same_origin()).status_code == 200
    assert anon.post("/api/inbox", content=PDF, headers={"Authorization": f"Bearer {token}"}).status_code == 401
