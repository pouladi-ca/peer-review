"""Per-user sessions: signed cookies, login rate limiting, and the first-admin bootstrap."""

from __future__ import annotations

import sys
import threading
import time
from collections import deque

from fastapi import HTTPException, Request, Response
from itsdangerous import BadSignature, URLSafeSerializer

from . import users
from .config import COOKIE_MAX_AGE, COOKIE_NAME, LOGIN_ATTEMPT_LIMIT, LOGIN_ATTEMPT_WINDOW, Config
from .db import Database
from .users import User

MAX_TRACKED_IPS = 10_000
SESSION_TOUCH_MS = 10 * 60 * 1000


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("fly-client-ip")
    if forwarded:
        return forwarded.strip()
    return request.client.host if request.client else "unknown"


class RateLimiter:
    """Sliding-window failure counter keyed by client IP."""

    def __init__(
        self,
        limit: int = LOGIN_ATTEMPT_LIMIT,
        window: int = LOGIN_ATTEMPT_WINDOW,
        max_keys: int = MAX_TRACKED_IPS,
    ) -> None:
        self.limit = limit
        self.window = window
        self.max_keys = max_keys
        self._lock = threading.Lock()
        self._failures: dict[str, deque[float]] = {}

    def _prune(self, key: str, now: float) -> int:
        hits = self._failures.get(key)
        if hits is None:
            return 0
        while hits and now - hits[0] > self.window:
            hits.popleft()
        if not hits:
            del self._failures[key]
            return 0
        return len(hits)

    def blocked(self, key: str) -> bool:
        with self._lock:
            return self._prune(key, time.monotonic()) >= self.limit

    def retry_after(self, key: str) -> int:
        with self._lock:
            now = time.monotonic()
            if self._prune(key, now) < self.limit:
                return 0
            oldest_counted = self._failures[key][-self.limit]
            return max(1, int(self.window - (now - oldest_counted)) + 1)

    def record_failure(self, key: str) -> None:
        with self._lock:
            now = time.monotonic()
            self._prune(key, now)
            hits = self._failures.get(key)
            if hits is None:
                while len(self._failures) >= self.max_keys:
                    self._failures.pop(next(iter(self._failures)))
                hits = self._failures[key] = deque()
            hits.append(now)

    def clear(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)


class SessionAuth:
    """Issues and validates the per-user session cookie.

    A token names the user and their session generation; changing the password or
    signing out everywhere bumps the generation, which invalidates every other device.
    """

    def __init__(self, config: Config, db: Database) -> None:
        self.config = config
        self.db = db
        self.limiter = RateLimiter()
        self._serializer = URLSafeSerializer(config.session_secret, salt="pl-session")

    def issue_token(self, user: User, session_id: str) -> str:
        return self._serializer.dumps({"uid": user.id, "sid": session_id, "gen": user.generation, "iat": int(time.time())})

    def sign_in(self, user: User, request: Request, response: Response) -> None:
        """Start a session for a device and set its cookie."""
        with self.db.connect() as conn:
            session = users.create_session(conn, user.id, request.headers.get("user-agent", ""))
        self.set_cookie(response, self.issue_token(user, session.id))
        request.state.session_id = session.id

    def session_id(self, request: Request) -> str | None:
        """The current request's session id, if its token is valid."""
        try:
            payload = self._serializer.loads(request.cookies.get(COOKIE_NAME) or "")
        except BadSignature:
            return None
        sid = payload.get("sid") if isinstance(payload, dict) else None
        return sid if isinstance(sid, str) else None

    def user_for_token(self, token: str | None) -> User | None:
        if not token:
            return None
        try:
            payload = self._serializer.loads(token)
        except BadSignature:
            return None
        if not isinstance(payload, dict):
            return None
        issued_at = payload.get("iat")
        if not isinstance(issued_at, int) or not 0 <= time.time() - issued_at <= COOKIE_MAX_AGE:
            return None
        uid = payload.get("uid")
        sid = payload.get("sid")
        if not isinstance(uid, str) or not isinstance(sid, str):
            return None
        with self.db.connect(write=False) as conn:
            user = users.get(conn, uid)
            session = users.get_session(conn, sid)
        if user is None or user.disabled or user.generation != payload.get("gen"):
            return None
        if session is None or session.revoked or session.user_id != uid:
            return None
        # Keep "last seen" roughly current without a write on every request.
        if time.time() * 1000 - session.last_seen_at > SESSION_TOUCH_MS:
            with self.db.connect() as conn:
                users.touch_session(conn, sid)
        return user

    def set_cookie(self, response: Response, token: str) -> None:
        response.set_cookie(
            COOKIE_NAME,
            token,
            max_age=COOKIE_MAX_AGE,
            httponly=True,
            secure=self.config.secure_cookies,
            samesite="lax",
            path="/",
        )

    def clear_cookie(self, response: Response) -> None:
        response.delete_cookie(
            COOKIE_NAME, path="/", httponly=True, secure=self.config.secure_cookies, samesite="lax"
        )


def current_user(request: Request) -> User | None:
    """The signed-in user, looked up once per request and cached on the request state."""
    state = request.state
    if not hasattr(state, "user"):
        auth: SessionAuth = request.app.state.auth
        state.user = auth.user_for_token(request.cookies.get(COOKIE_NAME))
    return state.user


def session_is_valid(request: Request) -> bool:
    return current_user(request) is not None


def require_session(request: Request) -> User:
    user = current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


def require_admin(request: Request) -> User:
    user = require_session(request)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admins only.")
    return user


def bootstrap_admin(config: Config, db: Database) -> None:
    """Create the first admin from ADMIN_EMAIL and APP_PASSWORD when no user exists yet,
    and give them everything stored before accounts existed."""
    with db.connect() as conn:
        if users.count(conn) > 0:
            return
        email = users.normalize_email(config.admin_email)
        if not email or not config.app_password:
            sys.stderr.write(
                "panelist: no user accounts exist yet. Set ADMIN_EMAIL and APP_PASSWORD to create\n"
                "  the first admin, e.g.\n"
                "    ADMIN_EMAIL=you@example.org APP_PASSWORD=choose-one uv run uvicorn panelist.app:app\n"
            )
            raise SystemExit(1)
        admin = users.create(conn, email, config.app_password, is_admin=True, must_change=False)
        users.adopt_orphans(conn, admin.id)
