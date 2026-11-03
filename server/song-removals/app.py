#!/usr/bin/env python3
"""Authenticated Jellyfin song-removal queue for the future cleanup worker."""

import hmac
import json
import os
import re
import sqlite3
import uuid
from contextlib import closing
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl
from urllib.request import HTTPRedirectHandler, Request, build_opener


PREFIX = "/OnMyWave/RemovedSongs"
RETENTION = timedelta(days=7)
MAX_BODY = 4096
MAX_USER_ITEMS = 100_000
TOKEN_PATTERN = re.compile(r'(?:^|,)\s*Token="([A-Za-z0-9._~+/=-]{1,4096})"(?:,|$)')
UUID_PATTERN = re.compile(r"^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$")


def utc_now():
    return datetime.now(timezone.utc)


def timestamp(value):
    return value.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def parse_timestamp(value):
    if not isinstance(value, str) or len(value) > 40:
        raise ValueError("invalid timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("invalid timestamp") from error
    if parsed.tzinfo is None or parsed.utcoffset() != timedelta(0):
        raise ValueError("timestamp must be UTC")
    return timestamp(parsed)


def canonical_uuid(value):
    if not isinstance(value, str) or not UUID_PATTERN.fullmatch(value):
        raise ValueError("invalid identifier")
    return uuid.UUID(value).hex


def load_config():
    jellyfin_url = os.environ.get("JELLYFIN_URL", "").rstrip("/")
    if not jellyfin_url.startswith(("http://", "https://")):
        raise RuntimeError("JELLYFIN_URL must be an HTTP(S) URL")
    allowed = os.environ.get("ALLOWED_USER_IDS", "").split(",")
    try:
        allowed_ids = {canonical_uuid(value.strip()) for value in allowed if value.strip()}
    except ValueError as error:
        raise RuntimeError("ALLOWED_USER_IDS must contain Jellyfin user UUIDs") from error
    if not allowed_ids:
        raise RuntimeError("ALLOWED_USER_IDS must contain at least one user")
    token_file = Path(os.environ.get("WORKER_TOKEN_FILE", "/run/secrets/song-removals-worker-token"))
    worker_token = token_file.read_text(encoding="utf-8").strip()
    if len(worker_token) < 32 or not worker_token.isascii() or not all(32 < ord(char) < 127 for char in worker_token):
        raise RuntimeError("worker token must contain at least 32 printable ASCII characters")
    database = Path(os.environ.get("DATABASE_PATH", "/data/removals.sqlite3"))
    database.parent.mkdir(parents=True, exist_ok=True)
    return jellyfin_url, allowed_ids, worker_token, database


JELLYFIN_URL, ALLOWED_USER_IDS, WORKER_TOKEN, DATABASE = load_config()


def connect_db():
    connection = sqlite3.connect(DATABASE, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_db():
    with closing(connect_db()) as db, db:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                song_id TEXT NOT NULL UNIQUE,
                removed_at TEXT NOT NULL,
                received_at TEXT NOT NULL,
                purge_after TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS requests (
                song_id TEXT NOT NULL REFERENCES jobs(song_id),
                user_id TEXT NOT NULL,
                PRIMARY KEY (song_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS jobs_purge_id ON jobs(purge_after, id);
            """
        )


class RejectRedirects(HTTPRedirectHandler):
    def redirect_request(self, _request, _file, _code, _message, _headers, _url):
        return None


JELLYFIN_HTTP = build_opener(RejectRedirects())


def jellyfin_json(path, token):
    request = Request(
        JELLYFIN_URL + path,
        headers={"Authorization": f'MediaBrowser Token="{token}"', "Accept": "application/json"},
    )
    try:
        with JELLYFIN_HTTP.open(request, timeout=8) as response:
            if response.status != 200:
                raise RuntimeError("Jellyfin rejected the request")
            return json.loads(response.read(1_000_001))
    except HTTPError as error:
        if error.code in (401, 403):
            raise PermissionError from error
        if error.code == 404:
            raise LookupError from error
        raise RuntimeError("Jellyfin request failed") from error
    except (URLError, TimeoutError, json.JSONDecodeError, OSError) as error:
        raise RuntimeError("Jellyfin request failed") from error


def authorize_jellyfin(header):
    if not header or not header.startswith("MediaBrowser "):
        raise PermissionError
    match = TOKEN_PATTERN.search(header[len("MediaBrowser ") :])
    if not match:
        raise PermissionError
    token = match.group(1)
    try:
        user = jellyfin_json("/Users/Me", token)
    except LookupError as error:
        raise PermissionError from error
    try:
        if not isinstance(user, dict):
            raise ValueError("invalid user")
        user_id = canonical_uuid(user.get("Id"))
    except ValueError as error:
        raise PermissionError from error
    if user_id not in ALLOWED_USER_IDS:
        raise PermissionError
    return token, user_id


def job_dict(row):
    return {
        "songId": row["song_id"],
        "removedAt": row["removed_at"],
        "purgeAfter": row["purge_after"],
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "SongRemovals/1.0"

    def log_message(self, _format, *_args):
        # Requests include opaque Jellyfin credentials in their headers.
        return

    def reply(self, status, payload):
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        match = re.fullmatch(re.escape(PREFIX) + r"/([^/]+)", self.path)
        if not match:
            self.reply(404, {"error": "not-found"})
            return
        try:
            song_id = canonical_uuid(match.group(1))
            token, user_id = authorize_jellyfin(self.headers.get("Authorization", ""))
            length = int(self.headers.get("Content-Length", "-1"))
            if length < 0 or length > MAX_BODY:
                raise ValueError("invalid body")
            body = json.loads(self.rfile.read(length))
            if not isinstance(body, dict) or set(body) != {"removedAt"}:
                raise ValueError("invalid body")
            removed_at = parse_timestamp(body["removedAt"])
        except PermissionError:
            self.reply(403, {"error": "forbidden"})
            return
        except (ValueError, TypeError, json.JSONDecodeError):
            self.reply(400, {"error": "invalid-request"})
            return
        except RuntimeError:
            self.reply(502, {"error": "jellyfin-unavailable"})
            return

        try:
            with closing(connect_db()) as db:
                row = db.execute("SELECT * FROM jobs WHERE song_id = ?", (song_id,)).fetchone()
                requested = (
                    db.execute(
                        "SELECT 1 FROM requests WHERE song_id = ? AND user_id = ?", (song_id, user_id)
                    ).fetchone()
                    if row is not None
                    else None
                )
            if row is None or requested is None:
                item_id = str(uuid.UUID(hex=song_id))
                user_item_id = str(uuid.UUID(hex=user_id))
                try:
                    item = jellyfin_json(f"/Users/{user_item_id}/Items/{item_id}", token)
                    valid_item = (
                        isinstance(item, dict)
                        and item.get("Id") is not None
                        and canonical_uuid(item["Id"]) == song_id
                        and item.get("Type") == "Audio"
                    )
                except (PermissionError, LookupError, ValueError):
                    valid_item = False
                if not valid_item:
                    self.reply(404, {"error": "song-unavailable"})
                    return
            with closing(connect_db()) as db, db:
                db.execute("BEGIN IMMEDIATE")
                row = db.execute("SELECT * FROM jobs WHERE song_id = ?", (song_id,)).fetchone()
                if row is None:
                    received = utc_now()
                    received_at = timestamp(received)
                    purge_after = timestamp(received + RETENTION)
                    db.execute(
                        "INSERT INTO jobs (song_id, removed_at, received_at, purge_after) VALUES (?, ?, ?, ?)",
                        (song_id, removed_at, received_at, purge_after),
                    )
                    row = db.execute("SELECT * FROM jobs WHERE song_id = ?", (song_id,)).fetchone()
                db.execute("INSERT OR IGNORE INTO requests (song_id, user_id) VALUES (?, ?)", (song_id, user_id))
                db.commit()
            self.reply(200, job_dict(row))
        except (HTTPError, URLError, TimeoutError, OSError, RuntimeError):
            self.reply(502, {"error": "jellyfin-unavailable"})
        except sqlite3.Error:
            self.reply(503, {"error": "removal-store-unavailable"})
        except ValueError:
            self.reply(404, {"error": "song-unavailable"})

    def do_GET(self):
        if self.path == PREFIX:
            self.get_user_jobs()
            return
        if self.path.startswith(PREFIX + "/due"):
            self.get_due_jobs()
            return
        self.reply(404, {"error": "not-found"})

    def get_user_jobs(self):
        try:
            _token, user_id = authorize_jellyfin(self.headers.get("Authorization", ""))
        except PermissionError:
            self.reply(403, {"error": "forbidden"})
            return
        except RuntimeError:
            self.reply(502, {"error": "jellyfin-unavailable"})
            return
        try:
            with closing(connect_db()) as db, db:
                rows = db.execute(
                    "SELECT jobs.* FROM jobs JOIN requests USING (song_id) "
                    "WHERE requests.user_id = ? ORDER BY jobs.id LIMIT ?",
                    (user_id, MAX_USER_ITEMS + 1),
                ).fetchall()
            if len(rows) > MAX_USER_ITEMS:
                self.reply(413, {"error": "too-many-removals"})
                return
            self.reply(200, {"items": [job_dict(row) for row in rows]})
        except sqlite3.Error:
            self.reply(503, {"error": "removal-store-unavailable"})

    def get_due_jobs(self):
        authorization = self.headers.get("Authorization", "")
        if not authorization.isascii() or not hmac.compare_digest(authorization, f"Bearer {WORKER_TOKEN}"):
            self.reply(403, {"error": "forbidden"})
            return
        route, _separator, query = self.path.partition("?")
        if route != PREFIX + "/due":
            self.reply(404, {"error": "not-found"})
            return
        try:
            parts = parse_qsl(query, keep_blank_values=True, strict_parsing=True)
            params = dict(parts)
            if len(params) != len(parts) or set(params) - {"after", "limit"}:
                raise ValueError
            after = int(params.get("after", "0"))
            limit = int(params.get("limit", "100"))
            if not 0 <= after <= 2**63 - 1 or not 1 <= limit <= 500:
                raise ValueError
        except ValueError:
            self.reply(400, {"error": "invalid-request"})
            return
        try:
            now = timestamp(utc_now())
            with closing(connect_db()) as db, db:
                rows = db.execute(
                    "SELECT id, song_id, removed_at, received_at, purge_after FROM jobs "
                    "WHERE purge_after <= ? AND id > ? ORDER BY id LIMIT ?",
                    (now, after, limit + 1),
                ).fetchall()
            has_more = len(rows) > limit
            rows = rows[:limit]
            self.reply(
                200,
                {
                    "items": [
                        {
                            "id": row["id"],
                            "songId": row["song_id"],
                            "removedAt": row["removed_at"],
                            "receivedAt": row["received_at"],
                            "purgeAfter": row["purge_after"],
                        }
                        for row in rows
                    ],
                    "nextCursor": rows[-1]["id"] if has_more and rows else None,
                },
            )
        except sqlite3.Error:
            self.reply(503, {"error": "removal-store-unavailable"})


if __name__ == "__main__":
    initialize_db()
    port = int(os.environ.get("LISTEN_PORT", "8080"))
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()
