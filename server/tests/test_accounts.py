"""Accounts: admin invitations, forced password change, resets, and data isolation."""

from __future__ import annotations

from fastapi.testclient import TestClient

from conftest import EMAIL, PASSWORD, login_as, same_origin

PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def invite(client: TestClient, email: str = "colleague@example.org") -> tuple[str, str]:
    r = client.post("/api/admin/users", json={"email": email}, headers=same_origin())
    assert r.status_code == 200, r.text
    return r.json()["user"]["id"], r.json()["temporaryPassword"]


def test_admin_endpoints_need_an_admin(client: TestClient) -> None:
    uid, temp = invite(client)
    assert login_as(client, "colleague@example.org", temp).status_code == 200
    assert client.get("/api/admin/users").status_code == 403
    assert client.post("/api/admin/users", json={"email": "x@y.org"}, headers=same_origin()).status_code == 403


def test_invited_user_must_change_password_then_works(client: TestClient) -> None:
    uid, temp = invite(client)
    r = login_as(client, "colleague@example.org", temp)
    assert r.status_code == 200 and r.json()["mustChangePassword"] is True
    # Too short, wrong current, then success.
    assert client.post("/api/password", json={"current": temp, "new": "short"}, headers=same_origin()).status_code == 400
    assert client.post("/api/password", json={"current": "nope", "new": "a-much-longer-password"}, headers=same_origin()).status_code == 401
    ok = client.post("/api/password", json={"current": temp, "new": "a-much-longer-password"}, headers=same_origin())
    assert ok.status_code == 200 and ok.json()["mustChangePassword"] is False
    # The fresh cookie from the change keeps this device signed in; the temp password is dead.
    assert client.get("/api/me").status_code == 200
    assert login_as(client, "colleague@example.org", temp).status_code == 401
    assert login_as(client, "colleague@example.org", "a-much-longer-password").status_code == 200


def test_reviews_are_private_to_their_owner(client: TestClient) -> None:
    # The admin creates a review with a PDF.
    push = client.post(
        "/api/changes",
        json={"reviews": [{"id": "rv_admin1", "created_at": 1, "updated_at": 1}], "records": [{"review_id": "rv_admin1", "key": "meta", "data": {"title": "Mine"}, "updated_at": 1}], "account": [{"key": "framework:x", "data": {"name": "X"}, "updated_at": 1}]},
        headers=same_origin(),
    )
    assert push.status_code == 200
    up = client.put("/api/reviews/rv_admin1/files/doc_aaaaaa", content=PDF, headers={**same_origin(), "Content-Type": "application/pdf"})
    assert up.status_code == 200
    uid, temp = invite(client)
    login_as(client, "colleague@example.org", temp)
    # The colleague sees nothing of it, cannot fetch or overwrite it, and gets 404 rather than 403 for files.
    got = client.get("/api/changes").json()
    assert got["reviews"] == [] and got["records"] == [] and got["account"] == []
    assert client.get("/api/reviews/rv_admin1/files/doc_aaaaaa").status_code == 404
    assert client.head("/api/reviews/rv_admin1/files/doc_aaaaaa").status_code == 404
    assert client.get("/api/reviews/rv_admin1/docs/doc_aaaaaa/reflow").json() == {"status": "none"}  # indistinguishable from unknown
    assert client.get("/api/reviews/rv_admin1/docs/doc_aaaaaa/reflow/doc.json").status_code == 404
    hijack = client.post("/api/changes", json={"records": [{"review_id": "rv_admin1", "key": "meta", "data": {"title": "Taken"}, "updated_at": 99}]}, headers=same_origin())
    assert hijack.status_code == 403
    assert client.delete("/api/reviews/rv_admin1", headers=same_origin()).status_code == 404
    # Their own account records are separate even with the same key.
    client.post("/api/changes", json={"account": [{"key": "framework:x", "data": {"name": "Theirs"}, "updated_at": 5}]}, headers=same_origin())
    assert client.get("/api/changes").json()["account"][0]["data"] == {"name": "Theirs"}
    login_as(client, EMAIL, PASSWORD)
    mine = client.get("/api/changes").json()
    assert [r["id"] for r in mine["reviews"]] == ["rv_admin1"]
    assert mine["account"][0]["data"] == {"name": "X"}


def test_reset_disable_and_delete(client: TestClient) -> None:
    uid, temp = invite(client)
    # Reset: a new temporary password, old one dead, forced change again.
    reset = client.post(f"/api/admin/users/{uid}/reset", headers=same_origin())
    assert reset.status_code == 200
    new_temp = reset.json()["temporaryPassword"]
    assert new_temp != temp
    admin_cookies = dict(client.cookies)
    assert login_as(client, "colleague@example.org", temp).status_code == 401
    assert login_as(client, "colleague@example.org", new_temp).json()["mustChangePassword"] is True
    # Disable: sessions end at once and sign-in is refused.
    client.cookies.clear()
    client.cookies.update(admin_cookies)
    assert client.patch(f"/api/admin/users/{uid}", json={"disabled": True}, headers=same_origin()).status_code == 200
    assert login_as(client, "colleague@example.org", new_temp).status_code == 403
    client.cookies.clear()
    client.cookies.update(admin_cookies)
    # Self-protection.
    me = client.get("/api/me").json()["id"]
    assert client.patch(f"/api/admin/users/{me}", json={"disabled": True}, headers=same_origin()).status_code == 400
    assert client.delete(f"/api/admin/users/{me}", headers=same_origin()).status_code == 400
    # Delete removes the account.
    assert client.delete(f"/api/admin/users/{uid}", headers=same_origin()).status_code == 200
    assert [u["email"] for u in client.get("/api/admin/users").json()["users"]] == [EMAIL]


def test_duplicate_and_bad_emails_are_rejected(client: TestClient) -> None:
    assert client.post("/api/admin/users", json={"email": "not-an-email"}, headers=same_origin()).status_code == 400
    invite(client, "dup@example.org")
    assert client.post("/api/admin/users", json={"email": "Dup@Example.org"}, headers=same_origin()).status_code == 409


def test_sessions_are_listed_and_can_be_ended_per_device(client: TestClient, anon: TestClient) -> None:
    mine = client.get("/api/sessions").json()["sessions"]
    assert len(mine) == 1 and mine[0]["current"] is True and "·" in mine[0]["label"]
    # A second device signs in.
    other = TestClient(client.app, base_url="http://testserver", headers={"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"})
    assert other.post("/api/login", json={"email": EMAIL, "password": PASSWORD}, headers=same_origin()).status_code == 200
    listed = client.get("/api/sessions").json()["sessions"]
    assert len(listed) == 2
    phone = next(s for s in listed if not s["current"])
    assert phone["label"] == "iPhone · Safari"
    # Ending the phone's session signs that device out and nothing else.
    assert client.delete(f"/api/sessions/{phone['id']}", headers=same_origin()).status_code == 200
    assert other.get("/api/me").status_code == 401
    assert client.get("/api/me").status_code == 200
    # Logging out ends the current session for good, even if the cookie were replayed.
    cookie = dict(client.cookies)
    client.post("/api/logout", headers=same_origin())
    client.cookies.update(cookie)
    assert client.get("/api/me").status_code == 401


def test_passkey_options_need_a_session_but_login_options_do_not(client: TestClient) -> None:
    anon = TestClient(client.app, base_url="http://testserver")  # the `anon` fixture is the client before login: same cookie jar
    assert anon.post("/api/passkeys/register/options", headers=same_origin()).status_code == 401
    opts = client.post("/api/passkeys/register/options", headers=same_origin()).json()
    assert opts["options"]["rp"]["id"] == "testserver" and opts["options"]["user"]["name"] == EMAIL
    login_opts = anon.post("/api/passkeys/login/options", json={"email": EMAIL}, headers=same_origin()).json()
    assert "challenge" in login_opts["options"] and login_opts["options"]["allowCredentials"] == []
    assert client.get("/api/passkeys").json() == {"passkeys": []}
