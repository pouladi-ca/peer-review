"""Runtime configuration, resolved once from the environment."""

from __future__ import annotations

import os
import secrets
import sys
from dataclasses import dataclass
from pathlib import Path

COOKIE_NAME = "pl_session"
COOKIE_MAX_AGE = 180 * 24 * 60 * 60  # 180 days
MAX_UPLOAD_BYTES = 150 * 1024 * 1024
MAX_BODY_BYTES = 8 * 1024 * 1024  # a change batch: annotations, scores, drafts
SESSION_SECRET_BYTES = 32
LOGIN_ATTEMPT_LIMIT = 5
LOGIN_ATTEMPT_WINDOW = 15 * 60

REPO_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True, slots=True)
class Config:
    """``admin_email`` and ``app_password`` only seed the first admin account when the
    database has no users yet; after that, passwords live in the database."""

    admin_email: str
    app_password: str
    session_secret: bytes
    data_dir: Path
    static_dir: Path | None
    port: int
    secure_cookies: bool

    @property
    def db_path(self) -> Path:
        return self.data_dir / "db.sqlite"

    def review_dir(self, review_id: str) -> Path:
        return self.data_dir / "reviews" / review_id


def _resolve_static_dir() -> Path | None:
    raw = os.environ.get("STATIC_DIR")
    candidate = Path(raw).expanduser() if raw else REPO_ROOT / "dist"
    candidate = candidate.resolve()
    return candidate if candidate.is_dir() else None


def _load_session_secret(data_dir: Path) -> bytes:
    """Read the persisted secret, or mint one atomically."""
    from_env = os.environ.get("SESSION_SECRET")
    if from_env:
        return from_env.encode()
    path = data_dir / "session_secret"
    try:
        existing = path.read_bytes()
    except OSError:
        existing = b""
    if len(existing) >= SESSION_SECRET_BYTES:
        return existing
    secret = secrets.token_bytes(SESSION_SECRET_BYTES)
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as handle:
        handle.write(secret)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp, path)
    return secret


def load_config() -> Config:
    password = os.environ.get("APP_PASSWORD", "")
    admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    data_dir = Path(os.environ.get("DATA_DIR", "./data")).expanduser().resolve()
    try:
        data_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:  # pragma: no cover
        sys.stderr.write(f"panelist: cannot use DATA_DIR {data_dir}: {exc}\n")
        raise SystemExit(1) from exc
    return Config(
        admin_email=admin_email,
        app_password=password,
        session_secret=_load_session_secret(data_dir),
        data_dir=data_dir,
        static_dir=_resolve_static_dir(),
        port=int(os.environ.get("PORT", "8000")),
        secure_cookies=os.environ.get("PANELIST_INSECURE_COOKIES") != "1",
    )
