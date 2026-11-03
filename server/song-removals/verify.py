#!/usr/bin/env python3
"""Manual HTTP integration check. Run with python3 server/song-removals/verify.py."""

import json
import os
import re
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parent
ALICE = "11111111-1111-4111-8111-111111111111"
BOB = "33333333-3333-4333-8333-333333333333"
OUTSIDER = "44444444-4444-4444-8444-444444444444"
SONG_A = "22222222-2222-4222-8222-222222222222"
SONG_B = "55555555-5555-4555-8555-555555555555"
TOKENS = {"alice-token": ALICE, "bob-token": BOB, "outsider-token": OUTSIDER}
ACCESS = {uuid.UUID(SONG_A).hex: {ALICE}, uuid.UUID(SONG_B).hex: {BOB}}


class FakeJellyfin(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args):
        return

    def do_GET(self):
        match = re.search(r'Token="([^"]+)"', self.headers.get("Authorization", ""))
        user_id = TOKENS.get(match.group(1)) if match else None
        if user_id is None:
            self.send_error(401)
            return
        if self.path == "/Users/Me":
            self.send_json({"Id": user_id})
            return
        item = re.fullmatch(r"/Users/([a-fA-F0-9-]+)/Items/([a-fA-F0-9-]+)", self.path)
        if item:
            requested_user = uuid.UUID(item.group(1)).hex
            song_id = uuid.UUID(item.group(2)).hex
            if requested_user == user_id.replace("-", "") and user_id in ACCESS.get(song_id, set()):
                self.send_json({"Id": song_id, "Type": "Audio"})
                return
        self.send_error(404)

    def send_json(self, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def utc(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def main():
    with tempfile.TemporaryDirectory(prefix="song-removals-check-") as directory:
        temp = Path(directory)
        worker_file = temp / "worker-token"
        worker_file.write_text("verification-worker-token-7da84e6f52a1")
        database = temp / "removals.sqlite3"
        jellyfin = ThreadingHTTPServer(("127.0.0.1", 0), FakeJellyfin)
        threading.Thread(target=jellyfin.serve_forever, daemon=True).start()
        api_socket = ThreadingHTTPServer(("127.0.0.1", 0), BaseHTTPRequestHandler)
        api_port = api_socket.server_address[1]
        api_socket.server_close()
        env = os.environ.copy()
        env.update(
            JELLYFIN_URL=f"http://127.0.0.1:{jellyfin.server_port}",
            ALLOWED_USER_IDS=f"{ALICE},{BOB}",
            WORKER_TOKEN_FILE=str(worker_file),
            DATABASE_PATH=str(database),
            LISTEN_PORT=str(api_port),
        )
        base = f"http://127.0.0.1:{api_port}"
        api = None

        def start_api():
            process = subprocess.Popen(
                [sys.executable, str(ROOT / "app.py")],
                cwd=ROOT,
                env=env,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE,
            )
            for _ in range(100):
                if process.poll() is not None:
                    raise RuntimeError(process.stderr.read().decode("utf-8", errors="replace"))
                try:
                    status, _body = request("/health")
                    if status == 404:
                        return process
                except (ConnectionError, OSError):
                    pass
                time.sleep(0.05)
            process.terminate()
            raise RuntimeError("The API did not start.")

        def request(path, method="GET", token=None, body=None):
            headers = {}
            if token:
                headers["Authorization"] = token
            if body is not None:
                headers["Content-Type"] = "application/json"
            req = urllib.request.Request(
                base + path,
                data=json.dumps(body).encode("utf-8") if body is not None else None,
                headers=headers,
                method=method,
            )
            try:
                with urllib.request.urlopen(req, timeout=3) as response:
                    return response.status, json.loads(response.read())
            except urllib.error.HTTPError as error:
                return error.code, json.loads(error.read())

        try:
            api = start_api()
            alice = 'MediaBrowser Client="verify", Token="alice-token"'
            bob = 'MediaBrowser Client="verify", Token="bob-token"'
            outsider = 'MediaBrowser Client="verify", Token="outsider-token"'
            worker = "Bearer " + worker_file.read_text()
            first_status, first = request(
                f"/OnMyWave/RemovedSongs/{SONG_A}",
                "POST",
                alice,
                {"removedAt": "2026-11-03T10:00:00Z"},
            )
            assert first_status == 200
            with sqlite3.connect(database) as db:
                received, purge_after = db.execute(
                    "SELECT received_at, purge_after FROM jobs WHERE song_id = ?", (SONG_A.replace("-", ""),)
                ).fetchone()
            assert utc(purge_after) - utc(received) == timedelta(days=7)

            ACCESS[uuid.UUID(SONG_A).hex].clear()
            retry_status, retry = request(
                f"/OnMyWave/RemovedSongs/{SONG_A}",
                "POST",
                alice,
                {"removedAt": "2020-01-01T10:00:00Z"},
            )
            assert retry_status == 200 and retry == first
            forbidden_status, _ = request(f"/OnMyWave/RemovedSongs/{SONG_A}", "POST", bob, {"removedAt": "2026-11-03T10:00:00Z"})
            assert forbidden_status == 404
            bob_status, bob_items = request("/OnMyWave/RemovedSongs", token=bob)
            assert bob_status == 200 and bob_items["items"] == []

            second_status, _ = request(
                f"/OnMyWave/RemovedSongs/{SONG_B}",
                "POST",
                bob,
                {"removedAt": "2026-11-03T10:01:00Z"},
            )
            assert second_status == 200
            assert request("/OnMyWave/RemovedSongs", token=alice)[1]["items"][0]["songId"] == SONG_A.replace("-", "")
            assert request("/OnMyWave/RemovedSongs", token=outsider)[0] == 403
            assert request("/OnMyWave/RemovedSongs", token='MediaBrowser Token="invalid"')[0] == 403
            assert request("/OnMyWave/RemovedSongs/due?after=0&limit=10", token="Bearer wrong")[0] == 403
            assert request("/OnMyWave/RemovedSongs/not-an-id", "POST", alice, {"removedAt": "bad"})[0] == 400
            assert request("/OnMyWave/RemovedSongs/due?after=999999999999999999999999999999999", token=worker)[0] == 400

            boundary = datetime.now(timezone.utc) + timedelta(seconds=1)
            boundary_text = boundary.isoformat(timespec="microseconds").replace("+00:00", "Z")
            with sqlite3.connect(database) as db:
                db.execute("UPDATE jobs SET purge_after = ?", (boundary_text,))
            assert request("/OnMyWave/RemovedSongs/due?after=0&limit=1", token=worker)[1]["items"] == []
            time.sleep(max(0, (boundary - datetime.now(timezone.utc)).total_seconds()) + 0.05)
            first_page_status, first_page = request("/OnMyWave/RemovedSongs/due?after=0&limit=1", token=worker)
            assert first_page_status == 200 and len(first_page["items"]) == 1
            assert first_page["nextCursor"] == first_page["items"][0]["id"]
            second_page_status, second_page = request(
                f"/OnMyWave/RemovedSongs/due?after={first_page['nextCursor']}&limit=1", token=worker
            )
            assert second_page_status == 200 and second_page["items"][0]["songId"] == SONG_B.replace("-", "")
            assert second_page["nextCursor"] is None

            api.terminate()
            api.wait(timeout=5)
            api = start_api()
            reopened_status, reopened = request("/OnMyWave/RemovedSongs", token=alice)
            assert reopened_status == 200 and len(reopened["items"]) == 1
            print("PASS: Jellyfin auth and per-user access, idempotent duplicate requests, seven-day timestamp math, due boundary/paging, malformed input and worker-secret checks, SQLite restart persistence")
        finally:
            if api is not None and api.poll() is None:
                api.terminate()
                api.wait(timeout=5)
            jellyfin.shutdown()
            jellyfin.server_close()


if __name__ == "__main__":
    main()
