"""SQLite schema and connection helpers.

Everything a review contains is a *record*: a JSON value stored under a key within a
review (``meta``, ``score:<criterion>``, ``ann:<id>``, ``doc:<id>`` …). Records carry the
client's ``updated_at`` (milliseconds) for last-writer-wins merging, and a global
``server_seq`` so clients can ask for "everything since the last sequence I saw".
Deletions are tombstones (``deleted = 1``) so they replicate too. Account-level records
(custom frameworks) live in a separate table with the same shape.
"""

from __future__ import annotations

import re
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    server_seq INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS records (
    review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    server_seq INTEGER NOT NULL,
    PRIMARY KEY (review_id, key)
);
CREATE INDEX IF NOT EXISTS records_by_seq ON records(server_seq);

CREATE TABLE IF NOT EXISTS account_records (
    key TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    server_seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_by_seq ON account_records(server_seq);

CREATE TABLE IF NOT EXISTS files (
    review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    doc_id TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    uploaded_at INTEGER NOT NULL,
    PRIMARY KEY (review_id, doc_id)
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""

SEQ_KEY = "server_seq"
REVIEW_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,40}$")
DOC_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,40}$")
RECORD_KEY_RE = re.compile(r"^[A-Za-z0-9_:.\-]{1,120}$")


class Database:
    """Owns the SQLite file; hands out short-lived connections."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path, timeout=15, isolation_level=None)
        try:
            conn.execute("PRAGMA journal_mode = WAL")
            conn.executescript(SCHEMA)
        finally:
            conn.close()

    @contextmanager
    def connect(self, *, write: bool = True) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.path, timeout=15, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA busy_timeout = 15000")
        try:
            conn.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield conn
            conn.execute("COMMIT")
        except BaseException:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()

    def get_setting(self, key: str, default: str) -> str:
        with self.connect(write=False) as conn:
            row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default

    def set_setting(self, key: str, value: str) -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT INTO settings(key, value) VALUES(?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, value),
            )


def next_seq(conn: sqlite3.Connection) -> int:
    """Allocate the next global sequence number inside the caller's transaction."""
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (SEQ_KEY,)).fetchone()
    current = int(row["value"]) if row else 0
    nxt = current + 1
    conn.execute(
        "INSERT INTO settings(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (SEQ_KEY, str(nxt)),
    )
    return nxt


def current_seq(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (SEQ_KEY,)).fetchone()
    return int(row["value"]) if row else 0
