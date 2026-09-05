"""Sign in, sign out, session probe."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field

from ..auth import SessionAuth, client_ip, require_session

router = APIRouter(prefix="/api", tags=["auth"])


class LoginBody(BaseModel):
    password: str = Field(default="")


def _auth(request: Request) -> SessionAuth:
    return request.app.state.auth


@router.post("/login")
def login(body: LoginBody, request: Request, response: Response) -> dict[str, bool]:
    auth = _auth(request)
    ip = client_ip(request)
    wait = auth.limiter.retry_after(ip)
    if wait:
        minutes = -(-wait // 60)
        plural = "s" if minutes != 1 else ""
        raise HTTPException(
            status_code=429,
            detail=f"Too many sign-in attempts. Try again in {minutes} minute{plural}.",
            headers={"Retry-After": str(wait)},
        )
    if not auth.password_matches(body.password):
        auth.limiter.record_failure(ip)
        raise HTTPException(status_code=401, detail="That password is not right.")
    auth.limiter.clear(ip)
    auth.set_cookie(response, auth.issue_token())
    return {"ok": True}


@router.post("/logout", dependencies=[Depends(require_session)])
def logout(request: Request, response: Response) -> dict[str, bool]:
    _auth(request).clear_cookie(response)
    return {"ok": True}


@router.post("/logout-everywhere", dependencies=[Depends(require_session)])
def logout_everywhere(request: Request, response: Response) -> dict[str, bool]:
    auth = _auth(request)
    auth.bump_generation()
    auth.clear_cookie(response)
    return {"ok": True}


@router.get("/me", dependencies=[Depends(require_session)])
def me() -> dict[str, bool]:
    return {"ok": True}
