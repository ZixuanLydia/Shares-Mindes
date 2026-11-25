#!/usr/bin/env python3
"""Secret Garden classroom server: standard-library HTTP + durable SQLite.

Run from any directory: python3 server/shared_garden.py
Use --host 0.0.0.0 explicitly to invite people on the same trusted network.
The database is outside the static document root. No cloud service is involved.
"""
import argparse
import hashlib
import ipaddress
import json
import math
import secrets
import socket
import sqlite3
import subprocess
import sys
import threading
import uuid
import webbrowser
from datetime import datetime, timezone, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit, parse_qs

ROOT = Path(__file__).resolve().parents[1]
MAX_BODY = 384 * 1024
MAX_GROWTH = 2000
SPOTS = [
    (.82, .61, .43), (.42, .66, .24), (.75, .35, -.67),
    (.92, .46, -.37), (.59, .72, .66), (.36, .77, .36),
    (.85, .30, -.81), (.44, .36, -.52), (.91, .74, .57),
    (.70, .79, .80), (.52, .25, -.84), (.96, .59, -.13),
]
SOURCES = {"seed", "planted", "mouse", "keyboard", "body", "snapshot"}
PRIVATE_LAN_RANGES = tuple(ipaddress.IPv4Network(cidr) for cidr in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"))


def lan_addresses():
    """Read configured private IPv4 addresses; never probe or change a network.

    macOS hostnames are not always registered in DNS. ipconfig getifaddr reads
    each configured Ethernet/Wi-Fi interface directly in that case.
    """
    addresses = []

    def add(value):
        try:
            address = ipaddress.IPv4Address(value.strip())
        except (ValueError, AttributeError):
            return
        if any(address in subnet for subnet in PRIVATE_LAN_RANGES) and str(address) not in addresses:
            addresses.append(str(address))

    # Prefer actual Ethernet/Wi-Fi interfaces over a hostname's VPN address.
    if sys.platform == "darwin":
        try:
            interfaces = [name for _, name in socket.if_nameindex() if name.startswith(("en", "bridge"))]
        except OSError:
            interfaces = ["en0", "en1", "en2"]
        for interface in interfaces[:16]:
            try:
                result = subprocess.run(["/usr/sbin/ipconfig", "getifaddr", interface],
                                        capture_output=True, text=True, timeout=2, check=False)
                if result.returncode == 0:
                    add(result.stdout)
            except (OSError, subprocess.SubprocessError):
                continue
    try:
        for item in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            add(item[4][0])
    except socket.gaierror:
        pass
    return addresses


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class APIError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def text(value, limit, field):
    if not isinstance(value, str) or not value.strip() or "\x00" in value:
        raise APIError(400, "Invalid " + field + ".")
    try:
        if len(value.encode("utf-16-le")) // 2 > limit:
            raise ValueError()
    except (UnicodeEncodeError, ValueError):
        raise APIError(400, "Invalid " + field + ".")
    return value.strip()


def number(value, low, high, field):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise APIError(400, "Invalid " + field + ".")
    return value


def timestamp(value, field, allow_null=False):
    if allow_null and value is None:
        return None
    text(value, 64, field)
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if stamp.tzinfo is None or stamp < datetime(1970, 1, 1, tzinfo=timezone.utc) or stamp > datetime.now(timezone.utc) + timedelta(days=1):
            raise ValueError()
        return stamp.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    except (ValueError, OverflowError):
        raise APIError(400, "Invalid " + field + ".")


def growth_points(values):
    if values is None:
        return []
    if not isinstance(values, list) or len(values) > MAX_GROWTH:
        raise APIError(400, "Too many or invalid growth records.")
    seen, points = set(), []
    for value in values:
        if not isinstance(value, dict) or value.get("source") not in SOURCES:
            raise APIError(400, "Invalid growth record.")
        point = {
            "id": text(value.get("id"), 256, "growth ID"),
            "source": value["source"],
            "openness": number(value.get("openness"), 0, 1, "growth openness"),
            "at": timestamp(value.get("at"), "growth time", value["source"] == "snapshot"),
        }
        if point["id"] not in seen:
            points.append(point)
            seen.add(point["id"])
    return points


def read_flower(value):
    if not isinstance(value, dict):
        raise APIError(400, "Expected a flower object.")
    appearance, position = value.get("appearance"), value.get("position")
    if not isinstance(appearance, dict) or appearance.get("form") not in {"cup", "flared", "tall"} or appearance.get("color") not in {"peach", "lilac", "blue"}:
        raise APIError(400, "Invalid flower appearance.")
    if not isinstance(position, dict):
        raise APIError(400, "Invalid flower position.")
    labels = value.get("associations")
    if not isinstance(labels, list) or len(labels) > 12:
        raise APIError(400, "Invalid associations.")
    flower = {
        "id": text(value.get("id"), 128, "flower ID"),
        "thought": text(value.get("thought"), 180, "thought"),
        "associations": [text(word, 40, "association") for word in labels],
        "appearance": {
            "form": appearance["form"], "color": appearance["color"],
            "size": number(appearance.get("size"), .001, 8, "flower size"),
            "openness": number(appearance.get("openness"), 0, 1, "openness"),
        },
        "position": {key: number(position.get(key), -16, 16, "position") for key in ("x", "y", "z")},
        "createdAt": timestamp(value.get("createdAt"), "creation time"),
        "growth": growth_points(value.get("growth")),
    }
    if "/" in flower["id"] or "\\" in flower["id"]:
        raise APIError(400, "Invalid flower ID.")
    return flower


def immutable_fingerprint(flower):
    # Server placement/time/author and mutable growth are intentionally omitted:
    # retrying the original offline create must return its canonical saved copy.
    payload = {key: flower[key] for key in ("id", "thought", "associations")}
    payload["appearance"] = {key: flower["appearance"][key] for key in ("form", "color", "size")}
    return hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


class GardenStore:
    def __init__(self, database):
        database = Path(database)
        database.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.connection = sqlite3.connect(str(database), check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.executescript("""
          PRAGMA journal_mode=WAL;
          PRAGMA foreign_keys=ON;
          CREATE TABLE IF NOT EXISTS authors (
            id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE,
            nickname TEXT NOT NULL, created_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS flowers (
            id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES authors(id),
            fingerprint TEXT NOT NULL, body TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
          INSERT OR IGNORE INTO meta VALUES ('revision', 0);
        """)
        self.connection.commit()

    def close(self):
        with self.lock:
            self.connection.close()

    def revision(self):
        return self.connection.execute("SELECT value FROM meta WHERE key='revision'").fetchone()[0]

    def bump(self):
        self.connection.execute("UPDATE meta SET value=value+1 WHERE key='revision'")
        return self.revision()

    def authenticate(self, token):
        if not isinstance(token, str) or len(token) > 256:
            raise APIError(401, "A garden session is required.")
        digest = hashlib.sha256(token.encode()).hexdigest()
        author = self.connection.execute("SELECT id,nickname FROM authors WHERE token_hash=?", (digest,)).fetchone()
        if not author:
            raise APIError(401, "This garden session is no longer valid.")
        return {"id": author["id"], "name": author["nickname"]}

    def session(self, token, nickname=None):
        if nickname is not None:
            nickname = text(nickname, 80, "nickname")
        with self.lock, self.connection:
            if token:
                author = self.authenticate(token)
                if nickname is not None and nickname != author["name"]:
                    self.connection.execute("UPDATE authors SET nickname=? WHERE id=?", (nickname, author["id"]))
                    author["name"] = nickname
            else:
                token = secrets.token_urlsafe(32)
                author = {"id": str(uuid.uuid4()), "name": nickname or "Local gardener"}
                self.connection.execute("INSERT INTO authors VALUES(?,?,?,?)", (author["id"], hashlib.sha256(token.encode()).hexdigest(), author["name"], now_iso()))
            return {"token": token, "author": author, "revision": self.revision()}

    def snapshot(self):
        with self.lock:
            rows = self.connection.execute("SELECT body FROM flowers ORDER BY rowid").fetchall()
            return {"revision": self.revision(), "flowers": [json.loads(row[0]) for row in rows], "serverTime": now_iso()}

    def create(self, token, value):
        flower = read_flower(value)
        supplied_author = value.get("author")
        nickname = text(supplied_author["name"], 80, "author nickname") if isinstance(supplied_author, dict) and "name" in supplied_author else None
        fingerprint = immutable_fingerprint(flower)
        with self.lock, self.connection:
            author = self.authenticate(token)
            existing = self.connection.execute("SELECT author_id,fingerprint,body FROM flowers WHERE id=?", (flower["id"],)).fetchone()
            if existing:
                if existing["author_id"] != author["id"] or existing["fingerprint"] != fingerprint:
                    raise APIError(409, "This flower ID is already in use.")
                return {"flower": json.loads(existing["body"]), "revision": self.revision(), "created": False}
            # A nickname is a chosen label, not an authentication claim. Preserve
            # the label chosen at planting even if an offline queue is sent after
            # the profile was renamed. Ownership always comes from the token.
            if nickname is not None:
                author["name"] = nickname
            ordinal = self.connection.execute("SELECT COUNT(*) FROM flowers").fetchone()[0]
            x, y, z = SPOTS[ordinal % len(SPOTS)]
            # Reuse established depth lanes. Further cycles receive small stable
            # offsets instead of growing the garden outside the camera bounds.
            cycle = ordinal // len(SPOTS)
            if cycle:
                x = max(.30, min(.96, x + .027 * math.sin(cycle * 2.39996 + ordinal)))
                y = max(.24, min(.80, y + .025 * math.cos(cycle * 2.39996 + ordinal)))
                z = max(-.9, min(.9, z + .04 * math.sin(cycle * 1.381)))
            flower["position"] = {"x": x, "y": y, "z": z}
            flower["createdAt"] = now_iso()
            flower["author"] = author
            if not flower["growth"]:
                flower["growth"] = [{"id": "planted:" + flower["id"], "at": flower["createdAt"], "source": "planted", "openness": flower["appearance"]["openness"]}]
            self.connection.execute("INSERT INTO flowers VALUES(?,?,?,?)", (flower["id"], author["id"], fingerprint, json.dumps(flower, ensure_ascii=False)))
            return {"flower": flower, "revision": self.bump(), "created": True}

    def bloom(self, token, flower_id, value):
        if not isinstance(value, dict):
            raise APIError(400, "Expected a bloom update.")
        openness = number(value.get("openness"), 0, 1, "openness")
        samples = growth_points(value.get("growth"))
        with self.lock, self.connection:
            author = self.authenticate(token)
            row = self.connection.execute("SELECT author_id,body FROM flowers WHERE id=?", (flower_id,)).fetchone()
            if not row:
                raise APIError(404, "Flower not found.")
            if row["author_id"] != author["id"]:
                raise APIError(403, "Only the gardener who planted this flower can save its growth.")
            flower = json.loads(row["body"])
            previous = flower["appearance"]["openness"]
            if openness > previous:
                known = {point["id"] for point in flower["growth"]}
                for point in samples:
                    if point["id"] not in known and previous <= point["openness"] <= openness:
                        flower["growth"].append(point)
                        known.add(point["id"])
                if not samples or flower["growth"][-1]["openness"] != openness:
                    flower["growth"].append({"id": "server:" + str(uuid.uuid4()), "at": now_iso(), "source": "mouse", "openness": openness})
                flower["growth"].sort(key=lambda point: point["at"] or "")
                flower["appearance"]["openness"] = openness
                self.connection.execute("UPDATE flowers SET body=? WHERE id=?", (json.dumps(flower, ensure_ascii=False), flower_id))
                revision = self.bump()
            else:
                revision = self.revision()
            return {"flower": flower, "revision": revision}

    def position(self, token, flower_id, value):
        if not isinstance(value, dict) or not isinstance(value.get("position"), dict):
            raise APIError(400, "Expected a flower position.")
        supplied = value["position"]
        position = {"x": number(supplied.get("x"), .08, .96, "position x"),
                    "y": number(supplied.get("y"), .22, .82, "position y"),
                    "z": number(supplied.get("z"), -16, 16, "position z")}
        with self.lock, self.connection:
            author = self.authenticate(token)
            row = self.connection.execute("SELECT author_id,body FROM flowers WHERE id=?", (flower_id,)).fetchone()
            if not row:
                raise APIError(404, "Flower not found.")
            if row["author_id"] != author["id"]:
                raise APIError(403, "Only the gardener who planted this flower can save its position.")
            flower = json.loads(row["body"])
            if flower["position"] != position:
                flower["position"] = position
                self.connection.execute("UPDATE flowers SET body=? WHERE id=?", (json.dumps(flower, ensure_ascii=False), flower_id))
                revision = self.bump()
            else:
                revision = self.revision()
            return {"flower": flower, "revision": revision}


class GardenHTTPServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, store, document_root):
        self.store, self.document_root = store, Path(document_root).resolve()
        super().__init__(address, GardenHandler)


class GardenHandler(SimpleHTTPRequestHandler):
    server_version = "SecretGarden/1"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(kwargs.pop("directory", "")), **kwargs)

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def log_request(self, code="-", size="-"):
        if str(code) == "304" and self.command == "GET" and urlsplit(self.path).path == "/api/garden":
            return
        super().log_request(code, size)

    def translate_path(self, path):
        clean = unquote(urlsplit(path).path).lstrip("/")
        if not clean:
            clean = "Secret Garden.html"
        target = (self.server.document_root / clean).resolve()
        try:
            target.relative_to(self.server.document_root)
        except ValueError:
            return str(self.server.document_root / "__not_found__")
        if any(part.startswith(".") for part in Path(clean).parts):
            return str(self.server.document_root / "__not_found__")
        return str(target)

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        super().end_headers()

    def check_origin(self):
        host = self.headers.get("Host", "")
        parsed = urlsplit("http://" + host)
        hostname = parsed.hostname
        local_address = self.connection.getsockname()[0]
        allowed = {"localhost", "127.0.0.1", "::1", local_address, socket.gethostname().lower()}
        if not hostname or hostname.lower() not in allowed:
            raise APIError(403, "Use this computer's local garden address.")
        origin = self.headers.get("Origin")
        if origin and origin != "http://" + host:
            raise APIError(403, "Cross-origin garden requests are not allowed.")
        if self.headers.get("Sec-Fetch-Site") == "cross-site":
            raise APIError(403, "Cross-site garden requests are not allowed.")

    def token(self, body=None):
        value = self.headers.get("Authorization", "")
        if value.startswith("Bearer "):
            return value[7:]
        return body.get("token") if isinstance(body, dict) else None

    def read_json(self):
        if self.headers.get_content_type() != "application/json":
            raise APIError(415, "Send garden data as application/json.")
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise APIError(400, "Invalid request size.")
        if not 0 < length <= MAX_BODY:
            raise APIError(413, "Garden request is too large or empty.")
        try:
            value = json.loads(self.rfile.read(length).decode("utf-8"), parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        except (UnicodeDecodeError, ValueError):
            raise APIError(400, "Invalid garden JSON.")
        if not isinstance(value, dict):
            raise APIError(400, "Expected a JSON object.")
        return value

    def json_response(self, status, value=None, etag=None):
        payload = b"" if value is None else json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        if etag:
            self.send_header("ETag", etag)
        self.end_headers()
        if payload:
            self.wfile.write(payload)

    def api(self, method):
        try:
            self.check_origin()
            parsed = urlsplit(self.path)
            path = unquote(parsed.path)
            if method == "GET" and path == "/api/garden":
                snapshot = self.server.store.snapshot()
                etag = '"garden-%s"' % snapshot["revision"]
                since = parse_qs(parsed.query).get("since", [None])[0]
                if self.headers.get("If-None-Match") == etag or since == str(snapshot["revision"]):
                    self.json_response(304, etag=etag)
                else:
                    self.json_response(200, snapshot, etag)
            elif method == "POST" and path == "/api/session":
                body = self.read_json()
                self.json_response(200, self.server.store.session(self.token(body), body.get("nickname")))
            elif method == "POST" and path == "/api/flowers":
                result = self.server.store.create(self.token(), self.read_json())
                self.json_response(201 if result["created"] else 200, result)
            elif method == "PATCH" and path.startswith("/api/flowers/") and path.endswith("/bloom"):
                flower_id = path[len("/api/flowers/"):-len("/bloom")]
                if "/" in flower_id or not flower_id:
                    raise APIError(404, "Flower not found.")
                self.json_response(200, self.server.store.bloom(self.token(), flower_id, self.read_json()))
            elif method == "PATCH" and path.startswith("/api/flowers/") and path.endswith("/position"):
                flower_id = path[len("/api/flowers/"):-len("/position")]
                if "/" in flower_id or not flower_id:
                    raise APIError(404, "Flower not found.")
                self.json_response(200, self.server.store.position(self.token(), flower_id, self.read_json()))
            else:
                raise APIError(404, "Garden endpoint not found.")
        except APIError as error:
            self.json_response(error.status, {"error": error.message})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self.log_error("Garden request failed")
            self.json_response(500, {"error": "The garden could not save this request. Please try again."})

    def do_GET(self):
        if urlsplit(self.path).path.startswith("/api/"):
            self.api("GET")
        else:
            super().do_GET()

    def do_POST(self):
        self.api("POST")

    def do_PATCH(self):
        self.api("PATCH")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", help="Default is this computer only; use 0.0.0.0 for a trusted LAN.")
    parser.add_argument("--port", type=int, default=8851)
    parser.add_argument("--database", type=Path, default=Path(__file__).parent / "data" / "garden.sqlite3")
    parser.add_argument("--directory", type=Path, default=ROOT / "outputs")
    parser.add_argument("--open", action="store_true", help="Open this computer's garden in the default browser after starting.")
    parser.add_argument("--print-addresses", action="store_true", help="Print configured private LAN addresses and exit without starting a server.")
    args = parser.parse_args()
    if args.print_addresses:
        print(json.dumps(lan_addresses()))
        return
    store = GardenStore(args.database)
    server = GardenHTTPServer((args.host, args.port), store, args.directory)
    print("Shared Secret Garden: http://127.0.0.1:%s/" % server.server_port, flush=True)
    print("Saved garden: %s" % args.database.resolve(), flush=True)
    if args.host == "0.0.0.0":
        addresses = lan_addresses()
        print("LAN sharing is enabled. Keep this window open while classmates visit.", flush=True)
        for address in addresses:
            print("Invite on this Wi-Fi: http://%s:%s/" % (address, server.server_port), flush=True)
        if not addresses:
            print("Find this computer's Wi-Fi IP in System Settings, then invite with http://YOUR-IP:%s/" % server.server_port, flush=True)
    if args.open:
        # Triggered only by the user's launcher/explicit --open option, never by
        # API requests. Localhost also preserves the host's camera secure context.
        launch = threading.Timer(.35, lambda: webbrowser.open("http://127.0.0.1:%s/" % server.server_port))
        launch.daemon = True
        launch.start()
    try:
        server.serve_forever(poll_interval=.2)
    except KeyboardInterrupt:
        print("\nGarden stopped. Saved flowers remain in the database.", flush=True)
    finally:
        server.server_close()
        store.close()


if __name__ == "__main__":
    main()
