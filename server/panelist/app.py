"""FastAPI application factory: middleware, error shape, API routes, SPA serving."""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from starlette.datastructures import Headers
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .auth import SessionAuth, session_is_valid
from .config import MAX_BODY_BYTES, MAX_UPLOAD_BYTES, Config, load_config
from .db import Database
from .routes import auth as auth_routes
from .routes import sync as sync_routes

log = logging.getLogger("panelist.app")

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
LOGIN_PATH = "/api/login"
FILE_PATH_RE = re.compile(r"^/api/reviews/[^/]+/files/[^/]+$")
UPLOAD_HEADROOM = 64 * 1024
CSP = (
    "default-src 'self'; img-src 'self' blob: data:; "
    "media-src 'self' blob: mediastream:; style-src 'self' 'unsafe-inline'; "
    "font-src 'self' data:; worker-src 'self' blob:; "
    "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'"
)
HSTS = "max-age=31536000; includeSubDomains"
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
SHORT_CACHE = "public, max-age=3600"
NO_CACHE = "no-cache"
HASHED_ASSET_RE = re.compile(r"-(?=[0-9A-Za-z_-]*[0-9])[0-9A-Za-z_-]{8,}\.[a-z0-9]+$")
ALWAYS_FRESH = {"index.html", "sw.js", "manifest.webmanifest"}


class _BodyTooLarge(BaseException):
    """Raised out of the receive channel when a streamed body passes its cap."""


def _same_origin(request: Request) -> bool:
    origin = request.headers.get("origin")
    if origin and origin != "null":
        return urlsplit(origin).netloc == request.headers.get("host", "")
    site = request.headers.get("sec-fetch-site")
    if site:
        return site == "same-origin"
    return origin is None


def _is_api_path(path: str) -> bool:
    return path == "/api" or path.startswith("/api/")


def _body_limit(method: str, path: str) -> int:
    if method == "PUT" and FILE_PATH_RE.match(path):
        return MAX_UPLOAD_BYTES + UPLOAD_HEADROOM
    return MAX_BODY_BYTES


def _content_length(headers: Headers) -> int | None:
    raw = headers.get("content-length")
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _too_large() -> JSONResponse:
    return JSONResponse({"error": "That request was too large."}, status_code=413)


def _counting_receive(receive: Receive, limit: int) -> Receive:
    total = 0

    async def counted() -> Message:
        nonlocal total
        message = await receive()
        if message["type"] == "http.request":
            total += len(message.get("body", b""))
            if total > limit:
                raise _BodyTooLarge
        return message

    return counted


class ApiGuard:
    """Answer cross-site, unauthenticated, and oversized /api requests before reading the body."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not _is_api_path(scope["path"]):
            await self.app(scope, receive, send)
            return
        request = Request(scope, receive)
        path, method = scope["path"], request.method
        if method in UNSAFE_METHODS and not _same_origin(request):
            await JSONResponse({"error": "Cross-site request blocked."}, status_code=403)(
                scope, receive, send
            )
            return
        if path != LOGIN_PATH and not session_is_valid(request):
            await JSONResponse({"error": "Not signed in"}, status_code=401)(scope, receive, send)
            return
        limit = _body_limit(method, path)
        declared = _content_length(request.headers)
        if declared is not None and declared > limit:
            await _too_large()(scope, receive, send)
            return
        started = False

        async def watched_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, _counting_receive(receive, limit), watched_send)
        except _BodyTooLarge:
            if started:  # pragma: no cover
                raise
            await _too_large()(scope, receive, send)


def _cache_control(relative: str) -> str:
    name = relative.rsplit("/", 1)[-1]
    if name in ALWAYS_FRESH:
        return NO_CACHE
    if relative.startswith("assets/") or HASHED_ASSET_RE.search(name):
        return IMMUTABLE_CACHE
    return SHORT_CACHE


def _security_headers(cfg: Config) -> dict[str, str]:
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": CSP,
        "X-Frame-Options": "DENY",
    }
    if cfg.secure_cookies:
        headers["Strict-Transport-Security"] = HSTS
    return headers


def _install_static(app: FastAPI, static_dir: Path | None) -> None:
    if static_dir is None:

        @app.get("/")
        def api_only() -> dict[str, str]:
            return {"app": "panelist", "status": "api only", "hint": "Build the SPA (npm run build) or set STATIC_DIR."}

        return

    static_dir = static_dir.resolve()
    index = static_dir / "index.html"

    @app.get("/{spa_path:path}")
    def spa(spa_path: str) -> Any:
        if spa_path == "api" or spa_path.startswith("api/"):
            return JSONResponse({"error": "Not found"}, status_code=404)
        candidate = (static_dir / spa_path).resolve() if spa_path else index
        if candidate.is_file() and candidate.is_relative_to(static_dir):
            return FileResponse(candidate, headers={"Cache-Control": _cache_control(spa_path or "index.html")})
        return FileResponse(index, headers={"Cache-Control": NO_CACHE})


def create_app(config: Config | None = None) -> FastAPI:
    cfg = config or load_config()
    app = FastAPI(title="Panelist", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.config = cfg
    app.state.db = Database(cfg.db_path)
    app.state.auth = SessionAuth(cfg, app.state.db)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse({"error": exc.detail or "Something went wrong."}, status_code=exc.status_code, headers=exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, __: RequestValidationError) -> JSONResponse:
        return JSONResponse({"error": "That request was not valid."}, status_code=400)

    @app.exception_handler(Exception)
    async def unhandled_error(request: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
        return JSONResponse({"error": "Something went wrong"}, status_code=500, headers=_security_headers(cfg))

    app.add_middleware(ApiGuard)

    @app.middleware("http")
    async def security_headers(request: Request, call_next: Any) -> Any:
        response = await call_next(request)
        for name, value in _security_headers(cfg).items():
            response.headers.setdefault(name, value)
        return response

    @app.get("/healthz")
    def healthz() -> dict[str, bool]:
        return {"ok": True}

    app.include_router(auth_routes.router)
    app.include_router(sync_routes.router)
    _install_static(app, cfg.static_dir)
    return app


def __getattr__(name: str) -> Any:
    if name == "app":
        application = create_app()
        globals()["app"] = application
        return application
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
