"""`python -m panelist`: serve on $PORT with proxy headers trusted (for fly.io)."""

from __future__ import annotations

import os

import uvicorn

from .app import create_app

if __name__ == "__main__":
    uvicorn.run(create_app(), host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), proxy_headers=True, forwarded_allow_ips="*")
