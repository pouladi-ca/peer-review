from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from panelist.app import create_app
from panelist.config import Config

PASSWORD = "test-password"
EMAIL = "admin@example.org"


@pytest.fixture
def config(tmp_path: Path) -> Config:
    return Config(
        admin_email=EMAIL,
        app_password=PASSWORD,
        session_secret=b"x" * 32,
        data_dir=tmp_path,
        static_dir=None,
        port=8000,
        secure_cookies=False,
    )


@pytest.fixture
def anon(config: Config) -> TestClient:
    return TestClient(create_app(config), base_url="http://testserver")


@pytest.fixture
def client(anon: TestClient) -> TestClient:
    response = anon.post("/api/login", json={"email": EMAIL, "password": PASSWORD}, headers={"Origin": "http://testserver"})
    assert response.status_code == 200
    return anon


def same_origin() -> dict[str, str]:
    return {"Origin": "http://testserver"}


def login_as(client: TestClient, email: str, password: str):
    """Sign a client in as someone else (clears the current cookie first)."""
    client.cookies.clear()
    return client.post("/api/login", json={"email": email, "password": password}, headers=same_origin())
