from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import EMAIL, PASSWORD, same_origin


def test_api_requires_session(anon: TestClient) -> None:
    assert anon.get("/api/changes").status_code == 401
    assert anon.get("/api/me").status_code == 401
    assert anon.get("/healthz").status_code == 200


def test_login_sets_cookie_and_me_works(anon: TestClient) -> None:
    assert anon.post("/api/login", json={"email": EMAIL, "password": "wrong"}, headers=same_origin()).status_code == 401
    assert anon.post("/api/login", json={"email": "nobody@example.org", "password": PASSWORD}, headers=same_origin()).status_code == 401
    ok = anon.post("/api/login", json={"email": EMAIL.upper(), "password": PASSWORD}, headers=same_origin())
    assert ok.status_code == 200
    assert ok.json()["email"] == EMAIL and ok.json()["isAdmin"] is True and ok.json()["mustChangePassword"] is False
    me = anon.get("/api/me")
    assert me.status_code == 200 and me.json()["email"] == EMAIL


def test_lockout_after_five_failures(anon: TestClient) -> None:
    for _ in range(5):
        anon.post("/api/login", json={"email": EMAIL, "password": "nope"}, headers=same_origin())
    blocked = anon.post("/api/login", json={"email": EMAIL, "password": PASSWORD}, headers=same_origin())
    assert blocked.status_code == 429
    assert "Retry-After" in blocked.headers


def test_cross_site_mutation_blocked(client: TestClient) -> None:
    r = client.post("/api/changes", json={}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403


def test_logout_everywhere_invalidates(client: TestClient) -> None:
    assert client.get("/api/me").status_code == 200
    client.post("/api/logout-everywhere", headers=same_origin())
    assert client.get("/api/me").status_code == 401
