"""Real HTTP tests using two independent bearer sessions and a temporary SQLite DB."""
import concurrent.futures
import http.client
import json
import socket
import subprocess
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

from shared_garden import GardenHandler, GardenHTTPServer, GardenStore, lan_addresses, now_iso


class LANAddressTests(unittest.TestCase):
    def test_macos_hostname_failure_falls_back_to_read_only_ipconfig(self):
        def read_interface(args, **kwargs):
            self.assertEqual(args[:2], ["/usr/sbin/ipconfig", "getifaddr"])
            self.assertEqual(kwargs["timeout"], 2)
            values = {"en0": "192.168.10.21\n", "en1": "192.168.10.21\n", "en2": "203.0.113.8\n", "bridge0": "169.254.1.2\n"}
            return subprocess.CompletedProcess(args, 0, values[args[2]])
        with patch("shared_garden.sys.platform", "darwin"), \
             patch("shared_garden.socket.if_nameindex", return_value=[(1, "lo0"), (2, "en0"), (3, "en1"), (4, "en2"), (5, "bridge0"), (6, "utun0")]), \
             patch("shared_garden.socket.getaddrinfo", side_effect=socket.gaierror()), \
             patch("shared_garden.subprocess.run", side_effect=read_interface) as run:
            self.assertEqual(lan_addresses(), ["192.168.10.21"])
            self.assertEqual(run.call_count, 4)

    def test_unavailable_interfaces_and_public_addresses_are_ignored(self):
        info = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0)) for ip in ["127.0.0.1", "8.8.8.8", "10.20.30.40"]]
        with patch("shared_garden.sys.platform", "darwin"), \
             patch("shared_garden.socket.if_nameindex", side_effect=OSError()), \
             patch("shared_garden.subprocess.run", side_effect=FileNotFoundError()), \
             patch("shared_garden.socket.getaddrinfo", return_value=info):
            self.assertEqual(lan_addresses(), ["10.20.30.40"])

    def test_quiet_polling_still_logs_errors_and_mutations(self):
        handler = object.__new__(GardenHandler)
        handler.command, handler.path = "GET", "/api/garden?since=12"
        with patch("shared_garden.SimpleHTTPRequestHandler.log_request") as log:
            handler.log_request(304)
            log.assert_not_called()
            handler.log_request(500)
            log.assert_called_once_with(500, "-")
            log.reset_mock()
            handler.command, handler.path = "POST", "/api/flowers"
            handler.log_request(201)
            log.assert_called_once_with(201, "-")


class SharedGardenTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.web = self.root / "public"
        self.web.mkdir()
        (self.web / "Secret Garden.html").write_text("<!doctype html><title>Secret Garden</title>")
        self.database = self.root / "private" / "garden.sqlite3"
        self.start()

    def start(self):
        self.store = GardenStore(self.database)
        self.server = GardenHTTPServer(("127.0.0.1", 0), self.store, self.web)
        self.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.store.close()

    def tearDown(self):
        self.stop()
        self.temp.cleanup()

    def request(self, method, path, value=None, token=None, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        send_headers = dict(headers or {})
        if value is not None:
            send_headers["Content-Type"] = "application/json"
            body = json.dumps(value, ensure_ascii=False).encode()
        else:
            body = None
        if token:
            send_headers["Authorization"] = "Bearer " + token
        conn.request(method, path, body, send_headers)
        response = conn.getresponse()
        raw = response.read()
        status = response.status
        result_headers = dict(response.getheaders())
        conn.close()
        try:
            result = json.loads(raw) if raw else None
        except ValueError:
            result = raw
        return status, result, result_headers

    def session(self, name):
        status, session, _ = self.request("POST", "/api/session", {"nickname": name})
        self.assertEqual(status, 200)
        return session

    def flower(self, id="a", openness=.1):
        return {"id": id, "author": {"id": "forged", "name": "Forged"},
                "thought": "我想念家人一起吃晚饭的日子。", "associations": ["Memory", "Warmth"],
                "appearance": {"form": "cup", "color": "peach", "size": .39, "openness": openness},
                "position": {"x": .82, "y": .61, "z": .43}, "createdAt": now_iso(), "growth": []}

    def test_two_people_create_read_own_growth_and_restart(self):
        first, second = self.session("Alice"), self.session("Bob")
        self.assertNotEqual(first["author"]["id"], second["author"]["id"])
        original = self.flower()
        original["author"]["name"] = "Alice at planting"
        status, a, _ = self.request("POST", "/api/flowers", original, first["token"])
        self.assertEqual(status, 201)
        self.assertEqual(a["flower"]["author"], {"id": first["author"]["id"], "name": "Alice at planting"})
        status, b, _ = self.request("POST", "/api/flowers", self.flower("b"), second["token"])
        self.assertEqual(status, 201)
        self.assertNotEqual(a["flower"]["position"], b["flower"]["position"])
        status, snapshot, headers = self.request("GET", "/api/garden")
        self.assertEqual(status, 200)
        self.assertEqual(len(snapshot["flowers"]), 2)
        self.assertEqual(self.request("GET", "/api/garden", headers={"If-None-Match": headers["ETag"]})[0], 304)
        self.assertEqual(self.request("GET", "/api/garden?since=2")[0], 304)
        # Impersonating a name/author in the body cannot grant ownership.
        self.assertEqual(self.request("PATCH", "/api/flowers/a/bloom", {"openness": 1, "author": first["author"]}, second["token"])[0], 403)
        status, bloom, _ = self.request("PATCH", "/api/flowers/a/bloom", {"openness": .7, "growth": [{"id": "point", "source": "mouse", "at": now_iso(), "openness": .7}]}, first["token"])
        self.assertEqual(status, 200)
        self.assertEqual(bloom["flower"]["appearance"]["openness"], .7)
        self.assertEqual(bloom["flower"]["position"], a["flower"]["position"])
        status, retry, _ = self.request("POST", "/api/flowers", original, first["token"])
        self.assertEqual(status, 200)
        self.assertFalse(retry["created"])
        self.assertEqual(retry["flower"], bloom["flower"])
        self.request("POST", "/api/session", {"nickname": "Alice now"}, first["token"])
        renamed_retry = dict(original, author={"id": "another-forged-id", "name": "Alice now"})
        status, renamed, _ = self.request("POST", "/api/flowers", renamed_retry, first["token"])
        self.assertEqual(status, 200)
        self.assertEqual(renamed["flower"]["author"]["name"], "Alice at planting")
        status, stale, _ = self.request("PATCH", "/api/flowers/a/bloom", {"openness": .2}, first["token"])
        self.assertEqual(stale, bloom)
        self.stop()
        self.start()
        status, restored, _ = self.request("POST", "/api/session", {}, first["token"])
        self.assertEqual(restored["author"], {"id": first["author"]["id"], "name": "Alice now"})
        self.assertEqual(len(self.request("GET", "/api/garden")[1]["flowers"]), 2)
        self.assertEqual(self.request("GET", "/api/garden")[1]["revision"], 3)

    def test_id_conflicts_auth_validation_and_private_paths(self):
        first, second = self.session("Alice"), self.session("Bob")
        self.assertEqual(self.request("POST", "/api/flowers", self.flower())[0], 401)
        self.assertEqual(self.request("POST", "/api/flowers", self.flower(), "invalid")[0], 401)
        self.assertEqual(self.request("POST", "/api/flowers", self.flower(), first["token"])[0], 201)
        self.assertEqual(self.request("POST", "/api/flowers", self.flower(), second["token"])[0], 409)
        changed = self.flower()
        changed["thought"] = "Different immutable content."
        self.assertEqual(self.request("POST", "/api/flowers", changed, first["token"])[0], 409)
        bad = self.flower("bad")
        bad["appearance"]["openness"] = True
        self.assertEqual(self.request("POST", "/api/flowers", bad, first["token"])[0], 400)
        bad["appearance"]["openness"] = .2
        bad["thought"] = "😀" * 91
        self.assertEqual(self.request("POST", "/api/flowers", bad, first["token"])[0], 400)
        self.assertEqual(self.request("POST", "/api/session", {}, headers={"Origin": "https://example.com"})[0], 403)
        self.assertEqual(self.request("GET", "/api/garden", headers={"Host": "evil.example"})[0], 403)
        self.assertEqual(self.request("GET", "/../private/garden.sqlite3")[0], 404)
        self.assertEqual(self.request("GET", "/%2e%2e/private/garden.sqlite3")[0], 404)
        self.assertEqual(self.request("GET", "/")[0], 200)

    def test_simultaneous_creates_and_out_of_order_growth_do_not_lose_data(self):
        session = self.session("Parallel gardener")
        def create(index):
            return self.request("POST", "/api/flowers", self.flower("parallel-" + str(index)), session["token"])
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            created = list(pool.map(create, range(12)))
        self.assertTrue(all(result[0] == 201 for result in created))
        self.assertEqual(len({json.dumps(result[1]["flower"]["position"], sort_keys=True) for result in created}), 12)
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            list(pool.map(lambda amount: self.request("PATCH", "/api/flowers/parallel-0/bloom", {"openness": amount}, session["token"]), [.9, .4, .6, .8, .3]))
        snapshot = self.request("GET", "/api/garden")[1]
        self.assertEqual(len(snapshot["flowers"]), 12)
        flower = next(flower for flower in snapshot["flowers"] if flower["id"] == "parallel-0")
        self.assertEqual(flower["appearance"]["openness"], .9)

    def test_position_owner_sync_validation_growth_and_restart(self):
        owner, visitor = self.session("Mover"), self.session("Viewer")
        original = self.flower("moving")
        status, created, _ = self.request("POST", "/api/flowers", original, owner["token"])
        self.assertEqual(status, 201)
        position = {"x": .3, "y": .46, "z": .43}
        path = "/api/flowers/moving/position"
        self.assertEqual(self.request("PATCH", path, {"position": position})[0], 401)
        self.assertEqual(self.request("PATCH", path, {"position": position}, visitor["token"])[0], 403)
        for bad in [dict(position, x=.01), dict(position, x=True), dict(position, y=.9), dict(position, z=17), dict(position, z=float("nan"))]:
            self.assertEqual(self.request("PATCH", path, {"position": bad}, owner["token"])[0], 400)
        status, moved, _ = self.request("PATCH", path, {"position": position}, owner["token"])
        self.assertEqual(status, 200)
        self.assertEqual(moved["flower"]["position"], position)
        self.assertEqual({key: value for key, value in moved["flower"].items() if key != "position"},
                         {key: value for key, value in created["flower"].items() if key != "position"})
        self.assertEqual(self.request("PATCH", path, {"position": position}, owner["token"])[1], moved,
                         "Retrying an unchanged position does not bump the revision")
        self.assertEqual(self.request("GET", "/api/garden", token=visitor["token"])[1]["flowers"][0]["position"], position)
        status, grown, _ = self.request("PATCH", "/api/flowers/moving/bloom", {"openness": .8}, owner["token"])
        self.assertEqual(status, 200)
        self.assertEqual(grown["flower"]["position"], position)
        self.assertEqual(self.request("POST", "/api/flowers", original, owner["token"])[1]["flower"], grown["flower"],
                         "A retried create never resets a manually placed flower")
        self.stop()
        self.start()
        restored = self.request("GET", "/api/garden")[1]["flowers"][0]
        self.assertEqual(restored["position"], position)
        self.assertEqual(restored["appearance"]["openness"], .8)

    def test_legacy_depth_is_preserved_when_position_moves(self):
        owner = self.session("Legacy gardener")
        _, created, _ = self.request("POST", "/api/flowers", self.flower("legacy-depth"), owner["token"])
        legacy = created["flower"]
        legacy["position"]["z"] = 2
        # Simulate an existing valid v1 JSON object, whose schema accepts depth
        # beyond the renderer's clamped -1..1 projection range.
        with self.store.lock, self.store.connection:
            self.store.connection.execute("UPDATE flowers SET body=? WHERE id=?", (json.dumps(legacy), legacy["id"]))
            self.store.bump()
        self.assertEqual(self.request("GET", "/api/garden")[1]["flowers"][0]["position"]["z"], 2)
        position = {"x": .42, "y": .56, "z": 2}
        status, moved, _ = self.request("PATCH", "/api/flowers/legacy-depth/position", {"position": position}, owner["token"])
        self.assertEqual(status, 200)
        self.assertEqual(moved["flower"]["position"], position)
        self.assertEqual(moved["flower"]["appearance"], legacy["appearance"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
