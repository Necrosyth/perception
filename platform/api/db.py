"""Postgres access + schema migrations for the Surveillance Intelligence Lab API.

Connections come from standard ``POSTGRES_*`` env vars (set by docker-compose).
``migrate()`` applies ``platform/migrations/*.sql`` in filename order and is
idempotent (``schema_migrations`` tracks what has run) — call it on startup.
"""
from __future__ import annotations

import logging
import os
import pathlib
import re

import psycopg

logger = logging.getLogger("aina.api.db")

_MIGRATION_DIR = os.environ.get("AINA_MIGRATIONS_DIR", "")
_BEGIN_COMMIT = re.compile(r"(?im)^\s*(begin|commit)\s*;\s*$")


def dsn_kwargs() -> dict:
    return {
        "host": os.environ.get("POSTGRES_HOST", "postgres"),
        "port": int(os.environ.get("POSTGRES_PORT", "5432")),
        "user": os.environ.get("POSTGRES_USER", "aina"),
        "password": os.environ.get("POSTGRES_PASSWORD", "aina_dev_password"),
        "dbname": os.environ.get("POSTGRES_DB", "aina_sentinel"),
        "connect_timeout": int(os.environ.get("POSTGRES_CONNECT_TIMEOUT", "5")),
    }


def connect():
    # autocommit=True: each statement commits itself, so a /health ping or a
    # failed query can never leave an "idle in transaction" connection holding
    # locks (TRUNCATE deadlocks seen in dev). migrate() also forces it anyway.
    return psycopg.connect(autocommit=True, **dsn_kwargs())


def migrate(conn=None) -> list[str]:
    """Apply pending platform/migrations/*.sql scripts; returns applied names."""
    migrations_dir = _find_migrations_dir()
    if migrations_dir is None:
        logger.warning("no migrations directory found — skipping schema bootstrap")
        return []
    if conn is None:
        conn = connect()
    conn.autocommit = True
    applied: list[str] = []
    with conn.cursor() as cur:
        cur.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
        )
        done = {row[0] for row in cur.execute("SELECT name FROM schema_migrations")}
        for script in sorted(migrations_dir.glob("*.sql")):
            if script.name in done:
                continue
            body = _BEGIN_COMMIT.sub("", script.read_text(encoding="utf-8"))
            cur.execute(body)
            cur.execute("INSERT INTO schema_migrations (name) VALUES (%s)", (script.name,))
            applied.append(script.name)
            logger.info("applied migration %s", script.name)
    return applied


def _find_migrations_dir() -> pathlib.Path | None:
    candidates = [
        pathlib.Path(_MIGRATION_DIR) if _MIGRATION_DIR else None,
        pathlib.Path("/srv/aina/migrations"),
        pathlib.Path(__file__).resolve().parent.parent / "migrations",
        pathlib.Path(__file__).resolve().parent / "migrations",
        pathlib.Path.cwd() / "migrations",
    ]
    for candidate in candidates:
        if candidate is None:
            continue
        if candidate.is_dir():
            return candidate
    return None