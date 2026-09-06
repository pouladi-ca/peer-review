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
