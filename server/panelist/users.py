"""User accounts: password hashing, temporary passwords, and the users table.

Everything here works on an open connection inside the caller's transaction, so the
routes decide the transaction boundaries. Passwords are hashed with scrypt from the
standard library; a stored hash looks like ``scrypt$16384$8$1$<salt>$<hash>``.
"""

from __future__ import annotations

import base64
import hashlib
import re
import secrets
import sqlite3
import time
from dataclasses import dataclass
from typing import Any

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD_LENGTH = 10
# No 0/O, 1/l/I: a temporary password gets read aloud or copied from a screen.
TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
SCRYPT_N, SCRYPT_R, SCRYPT_P, SCRYPT_LEN = 16384, 8, 1, 32


@dataclass(frozen=True, slots=True)
class User:
    id: str
    email: str
    is_admin: bool
    disabled: bool
    must_change: bool
    generation: int
    created_at: int
    last_login_at: int | None

    def public(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "email": self.email,
            "isAdmin": self.is_admin,
            "disabled": self.disabled,
            "mustChangePassword": self.must_change,
            "createdAt": self.created_at,
            "lastLoginAt": self.last_login_at,
        }


def normalize_email(raw: str) -> str | None:
    email = raw.strip().lower()
    return email if EMAIL_RE.match(email) and len(email) <= 254 else None


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P, dklen=SCRYPT_LEN)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${b64(salt)}${b64(digest)}"


def verify_password(stored: str, candidate: str) -> bool:
    try:
        algo, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if algo != "scrypt":
            return False
        expected = base64.b64decode(hash_b64)
        digest = hashlib.scrypt(candidate.encode(), salt=base64.b64decode(salt_b64), n=int(n), r=int(r), p=int(p), dklen=len(expected))
    except (ValueError, TypeError):
        return False
    return secrets.compare_digest(digest, expected)


def temporary_password() -> str:
    groups = ["".join(secrets.choice(TEMP_ALPHABET) for _ in range(4)) for _ in range(3)]
    return "-".join(groups)


def new_id() -> str:
    return secrets.token_urlsafe(9)


def _row_to_user(row: sqlite3.Row) -> User:
    return User(
        id=row["id"],
        email=row["email"],
        is_admin=bool(row["is_admin"]),
        disabled=bool(row["disabled"]),
        must_change=bool(row["must_change"]),
        generation=int(row["generation"]),
        created_at=int(row["created_at"]),
        last_login_at=row["last_login_at"],
    )


def count(conn: sqlite3.Connection) -> int:
    return int(conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"])


def get(conn: sqlite3.Connection, user_id: str) -> User | None:
    row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _row_to_user(row) if row else None


def get_by_email(conn: sqlite3.Connection, email: str) -> User | None:
    row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    return _row_to_user(row) if row else None


def password_hash_of(conn: sqlite3.Connection, user_id: str) -> str | None:
    row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,)).fetchone()
    return row["password_hash"] if row else None


def list_all(conn: sqlite3.Connection) -> list[User]:
    return [_row_to_user(r) for r in conn.execute("SELECT * FROM users ORDER BY created_at, email")]


def create(conn: sqlite3.Connection, email: str, password: str, *, is_admin: bool = False, must_change: bool = True) -> User:
    now = int(time.time() * 1000)
    uid = new_id()
    conn.execute(
        "INSERT INTO users(id, email, password_hash, is_admin, disabled, must_change, generation, created_at) "
        "VALUES(?, ?, ?, ?, 0, ?, 1, ?)",
        (uid, email, hash_password(password), int(is_admin), int(must_change), now),
    )
    return get(conn, uid)  # type: ignore[return-value]


def set_password(conn: sqlite3.Connection, user_id: str, password: str, *, must_change: bool) -> int:
    """Store a new password and start a new session generation; returns the new generation."""
    conn.execute(
        "UPDATE users SET password_hash = ?, must_change = ?, generation = generation + 1 WHERE id = ?",
        (hash_password(password), int(must_change), user_id),
    )
    return int(conn.execute("SELECT generation FROM users WHERE id = ?", (user_id,)).fetchone()["generation"])


def bump_generation(conn: sqlite3.Connection, user_id: str) -> int:
    conn.execute("UPDATE users SET generation = generation + 1 WHERE id = ?", (user_id,))
    return int(conn.execute("SELECT generation FROM users WHERE id = ?", (user_id,)).fetchone()["generation"])


def set_flags(conn: sqlite3.Connection, user_id: str, *, disabled: bool | None = None, is_admin: bool | None = None) -> None:
    if disabled is not None:
        conn.execute("UPDATE users SET disabled = ? WHERE id = ?", (int(disabled), user_id))
    if is_admin is not None:
        conn.execute("UPDATE users SET is_admin = ? WHERE id = ?", (int(is_admin), user_id))


def touch_login(conn: sqlite3.Connection, user_id: str) -> None:
    conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (int(time.time() * 1000), user_id))


def owned_review_ids(conn: sqlite3.Connection, user_id: str) -> list[str]:
    return [r["id"] for r in conn.execute("SELECT id FROM reviews WHERE owner_id = ?", (user_id,))]


def delete(conn: sqlite3.Connection, user_id: str) -> list[str]:
    """Remove a user and everything they own; returns the review ids whose files must go too."""
    review_ids = owned_review_ids(conn, user_id)
    conn.execute("DELETE FROM files WHERE review_id IN (SELECT id FROM reviews WHERE owner_id = ?)", (user_id,))
    conn.execute("DELETE FROM reviews WHERE owner_id = ?", (user_id,))  # records cascade
    conn.execute("DELETE FROM account_records WHERE owner_id = ?", (user_id,))
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    return review_ids


def adopt_orphans(conn: sqlite3.Connection, user_id: str) -> None:
    """Give data from before accounts existed to a user (the first admin)."""
    conn.execute("UPDATE reviews SET owner_id = ? WHERE owner_id IS NULL OR owner_id = ''", (user_id,))
    conn.execute("UPDATE account_records SET owner_id = ? WHERE owner_id IS NULL OR owner_id = ''", (user_id,))


# --- inbox tokens: let a phone's share sheet post a PDF without a browser session ----------

def inbox_token() -> str:
    return secrets.token_urlsafe(24)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def set_inbox_token(conn: sqlite3.Connection, user_id: str, token: str | None) -> None:
    conn.execute("UPDATE users SET inbox_token_hash = ? WHERE id = ?", (token_hash(token) if token else None, user_id))


def has_inbox_token(conn: sqlite3.Connection, user_id: str) -> bool:
    row = conn.execute("SELECT inbox_token_hash FROM users WHERE id = ?", (user_id,)).fetchone()
    return bool(row and row["inbox_token_hash"])


def get_by_inbox_token(conn: sqlite3.Connection, token: str) -> User | None:
    row = conn.execute("SELECT * FROM users WHERE inbox_token_hash = ?", (token_hash(token),)).fetchone()
    return _row_to_user(row) if row else None


# --- sessions: one row per signed-in device, so each can be seen and ended ----------------

@dataclass(frozen=True, slots=True)
class Session:
    id: str
    user_id: str
    label: str
    created_at: int
    last_seen_at: int
    revoked: bool


def device_label(user_agent: str) -> str:
    """A short, human name for a device from its user agent: "iPhone · Safari"."""
    ua = user_agent or ""
    if "iPhone" in ua:
        device = "iPhone"
    elif "iPad" in ua:
        device = "iPad"
    elif "Android" in ua:
        device = "Android"
    elif "Macintosh" in ua:
        device = "Mac"
    elif "Windows" in ua:
        device = "Windows"
    elif "CrOS" in ua:
        device = "Chromebook"
    elif "Linux" in ua:
        device = "Linux"
    else:
        device = "Device"
    if "Edg/" in ua:
        browser = "Edge"
    elif "Firefox/" in ua:
        browser = "Firefox"
    elif "Chrome/" in ua or "CriOS/" in ua:
        browser = "Chrome"
    elif "Safari/" in ua:
        browser = "Safari"
    else:
        browser = "browser"
    return f"{device} · {browser}"


def create_session(conn: sqlite3.Connection, user_id: str, user_agent: str) -> Session:
    now = int(time.time() * 1000)
    sid = secrets.token_urlsafe(18)
    conn.execute(
        "INSERT INTO sessions(id, user_id, label, created_at, last_seen_at, revoked) VALUES(?, ?, ?, ?, ?, 0)",
        (sid, user_id, device_label(user_agent), now, now),
    )
    return Session(sid, user_id, device_label(user_agent), now, now, False)


def get_session(conn: sqlite3.Connection, sid: str) -> Session | None:
    row = conn.execute("SELECT * FROM sessions WHERE id = ?", (sid,)).fetchone()
    return Session(row["id"], row["user_id"], row["label"], int(row["created_at"]), int(row["last_seen_at"]), bool(row["revoked"])) if row else None


def touch_session(conn: sqlite3.Connection, sid: str) -> None:
    conn.execute("UPDATE sessions SET last_seen_at = ? WHERE id = ?", (int(time.time() * 1000), sid))


SESSION_STALE_MS = 180 * 24 * 60 * 60 * 1000  # the cookie's own lifetime


def list_sessions(conn: sqlite3.Connection, user_id: str) -> list[Session]:
    """Live sessions, newest activity first; ones whose cookie has expired are left out."""
    cutoff = int(time.time() * 1000) - SESSION_STALE_MS
    rows = conn.execute("SELECT * FROM sessions WHERE user_id = ? AND revoked = 0 AND last_seen_at > ? ORDER BY last_seen_at DESC", (user_id, cutoff))
    return [Session(r["id"], r["user_id"], r["label"], int(r["created_at"]), int(r["last_seen_at"]), bool(r["revoked"])) for r in rows]


def revoke_session(conn: sqlite3.Connection, sid: str, user_id: str) -> bool:
    cur = conn.execute("UPDATE sessions SET revoked = 1 WHERE id = ? AND user_id = ?", (sid, user_id))
    return cur.rowcount > 0


def revoke_all_sessions(conn: sqlite3.Connection, user_id: str) -> None:
    conn.execute("UPDATE sessions SET revoked = 1 WHERE user_id = ?", (user_id,))


# --- passkeys -------------------------------------------------------------------------

@dataclass(frozen=True, slots=True)
class Passkey:
    id: str
    user_id: str
    public_key: bytes
    sign_count: int
    transports: list[str]
    label: str
    created_at: int
    last_used_at: int | None

    def public(self) -> dict[str, Any]:
        return {"id": self.id, "label": self.label, "createdAt": self.created_at, "lastUsedAt": self.last_used_at}


def _row_to_passkey(r: sqlite3.Row) -> Passkey:
    return Passkey(r["id"], r["user_id"], bytes(r["public_key"]), int(r["sign_count"]), (r["transports"] or "").split(",") if r["transports"] else [], r["label"], int(r["created_at"]), r["last_used_at"])


def add_passkey(conn: sqlite3.Connection, user_id: str, cred_id: str, public_key: bytes, sign_count: int, transports: list[str], label: str) -> Passkey:
    now = int(time.time() * 1000)
    conn.execute(
        "INSERT INTO passkeys(id, user_id, public_key, sign_count, transports, label, created_at) VALUES(?, ?, ?, ?, ?, ?, ?)",
        (cred_id, user_id, public_key, sign_count, ",".join(transports), label, now),
    )
    return get_passkey(conn, cred_id)  # type: ignore[return-value]


def get_passkey(conn: sqlite3.Connection, cred_id: str) -> Passkey | None:
    row = conn.execute("SELECT * FROM passkeys WHERE id = ?", (cred_id,)).fetchone()
    return _row_to_passkey(row) if row else None


def list_passkeys(conn: sqlite3.Connection, user_id: str) -> list[Passkey]:
    return [_row_to_passkey(r) for r in conn.execute("SELECT * FROM passkeys WHERE user_id = ? ORDER BY created_at", (user_id,))]


def passkey_used(conn: sqlite3.Connection, cred_id: str, sign_count: int) -> None:
    conn.execute("UPDATE passkeys SET sign_count = ?, last_used_at = ? WHERE id = ?", (sign_count, int(time.time() * 1000), cred_id))


def delete_passkey(conn: sqlite3.Connection, cred_id: str, user_id: str) -> bool:
    return conn.execute("DELETE FROM passkeys WHERE id = ? AND user_id = ?", (cred_id, user_id)).rowcount > 0
