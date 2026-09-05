"""Password login, signed session cookies, and login rate limiting."""

from __future__ import annotations

import secrets
import threading
import time
from collections import deque

from fastapi import HTTPException, Request, Response
from itsdangerous import BadSignature, URLSafeSerializer

from .config import COOKIE_MAX_AGE, COOKIE_NAME, LOGIN_ATTEMPT_LIMIT, LOGIN_ATTEMPT_WINDOW, Config
from .db import Database

SESSION_GENERATION_KEY = "session_generation"
MAX_TRACKED_IPS = 10_000


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
    """Issues and validates the session cookie."""

    def __init__(self, config: Config, db: Database) -> None:
        self.config = config
        self.db = db
        self.limiter = RateLimiter()
        self._serializer = URLSafeSerializer(config.session_secret, salt="pl-session")

    def generation(self) -> int:
        return int(self.db.get_setting(SESSION_GENERATION_KEY, "1"))

    def bump_generation(self) -> int:
        generation = self.generation() + 1
        self.db.set_setting(SESSION_GENERATION_KEY, str(generation))
        return generation

    def password_matches(self, candidate: str) -> bool:
        return secrets.compare_digest(candidate.encode(), self.config.app_password.encode())

    def issue_token(self) -> str:
        return self._serializer.dumps({"gen": self.generation(), "iat": int(time.time())})

    def token_is_valid(self, token: str | None) -> bool:
        if not token:
            return False
        try:
            payload = self._serializer.loads(token)
        except BadSignature:
            return False
        if not isinstance(payload, dict) or payload.get("gen") != self.generation():
            return False
        issued_at = payload.get("iat")
        if not isinstance(issued_at, int):
            return False
        return 0 <= time.time() - issued_at <= COOKIE_MAX_AGE

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


def session_is_valid(request: Request) -> bool:
    auth: SessionAuth = request.app.state.auth
    return auth.token_is_valid(request.cookies.get(COOKIE_NAME))


def require_session(request: Request) -> None:
    if not session_is_valid(request):
        raise HTTPException(status_code=401, detail="Not signed in")
