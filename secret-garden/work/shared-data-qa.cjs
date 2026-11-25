const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = ["shared-garden.js", "garden-data.js"].map(name => fs.readFileSync(__dirname + "/" + name, "utf8")).join("\n");
const plain = value => JSON.parse(JSON.stringify(value));
const sharedKey = "secret-garden:shared:v1";
const localKey = "secret-garden:v1";
const draft = { thought: "A family meal I remember", associations: ["Memory"], form: "cup", color: "peach", openness: .25, size: .39, position: { x: .82, y: .61, z: .43 } };

function server() {
  let revision = 0;
  let serial = 0;
  const sessions = new Map();
  const flowers = new Map();
  const response = (status, body) => ({ status, ok: status >= 200 && status < 300, async json() { return plain(body); } });
  const requests = [];
  return {
    requests, flowers, sessions,
    async fetch(path, options = {}) {
      const method = options.method || "GET";
      requests.push({ path, method });
      const body = options.body ? JSON.parse(options.body) : {};
      const token = options.headers?.Authorization?.replace("Bearer ", "");
      const author = sessions.get(token);
      if (path === "/api/session") {
        if (token && !author) return response(401, { error: "Unknown gardener" });
        const nextToken = token || "token-" + ++serial;
        const person = author || { id: "author-" + serial, name: "Local gardener" };
        if (body.nickname) person.name = body.nickname;
        sessions.set(nextToken, person);
        return response(200, { token: nextToken, author: person, revision });
      }
      if (path === "/api/garden") {
        if (options.headers?.["If-None-Match"] === '"garden-' + revision + '"') return response(304, {});
        return response(200, { revision, flowers: [...flowers.values()], serverTime: new Date().toISOString() });
      }
      if (!author) return response(401, { error: "Unknown gardener" });
      if (path === "/api/flowers") {
        const previous = flowers.get(body.id);
        if (previous && previous.author.id !== author.id) return response(409, { error: "Another owner" });
        if (!previous) {
          const record = plain(body);
          record.author = { id: author.id, name: record.author.name };
          record.createdAt = new Date().toISOString();
          record.position = { x: .25 + flowers.size * .09, y: .64, z: .22 };
          flowers.set(body.id, record);
          revision++;
        }
        return response(200, { flower: flowers.get(body.id), revision, created: !previous });
      }
      const id = decodeURIComponent(path.split("/")[3]);
      const record = flowers.get(id);
      if (!record || record.author.id !== author.id) return response(403, { error: "Another owner" });
      record.appearance.openness = Math.max(record.appearance.openness, body.openness);
      const growth = new Map(record.growth.map(point => [point.id, point]));
      for (const point of body.growth || []) if (!growth.has(point.id)) growth.set(point.id, point);
      record.growth = [...growth.values()];
      revision++;
      return response(200, { flower: record, revision });
    }
  };
}

function client(backend, storage = new Map(), protocol = "http:") {
  let id = 0;
  let online = true;
  const timers = new Map();
  let timerId = 0;
  const listeners = new Map();
  const window = {
    location: { protocol },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    crypto: { randomUUID: () => "flower-point-" + ++id + "-" + Math.random().toString(16).slice(2) },
    addEventListener(name, fn) { listeners.set(name, fn); }
  };
  const context = vm.createContext({ window, document: { hidden: false }, console, Date, Promise, AbortController,
    fetch: (...args) => online ? backend.fetch(...args) : Promise.reject(Error("Offline")),
    setTimeout: (fn, delay) => { const key = ++timerId; timers.set(key, { fn, delay }); return key; },
    clearTimeout: key => timers.delete(key) });
  vm.runInContext(source, context);
  return { data: window.GardenData, transport: window.GardenShared, storage, context, timers,
    setOnline(value) { online = value; },
    async flush() { await window.GardenData.flush(); },
  };
}

(async () => {
  const backend = server();
  const privateRecord = { id: "private-old", author: { id: "private-person", name: "Private" }, thought: "Not shared", associations: [],
    appearance: { form: "cup", color: "blue", size: .39, openness: .1 }, position: draft.position, createdAt: new Date().toISOString() };
  const privateValue = JSON.stringify({ version: 1, author: privateRecord.author, flowers: [privateRecord] });
  const aStore = new Map([[localKey, privateValue]]);
  const a = client(backend, aStore);
  assert.deepEqual(plain(a.data.load()), [], "Checking must not show or upload the old private garden");
  await a.data.ready;
  const b = client(backend);
  await b.data.ready;
  assert(a.data.isShared && b.data.isShared);
  assert.notEqual(a.data.getAuthor().id, b.data.getAuthor().id);
  assert.equal(backend.flowers.size, 0);
  assert.equal(aStore.get(localKey), privateValue);

  assert(a.data.setNickname("Alice"));
  const first = a.data.createFlower(draft);
  assert.equal(first.author.name, "Alice");
  assert.equal(a.data.save([first]), false);
  assert(a.data.status.pending > 0);
  await a.flush();
  assert.equal(a.data.status.pending, 0);
  assert.equal(a.data.load()[0].author.name, "Alice");
  assert.notEqual(a.data.load()[0].position.x, draft.position.x, "Canonical placement replaces the optimistic spot");
  await b.flush();
  assert.equal(b.data.load().length, 1);
  assert.equal(b.data.isOwn(b.data.load()[0]), false);
  assert.equal(b.data.saveBloom(first.id, .9), null);
  assert.equal(backend.flowers.get(first.id).appearance.openness, .25);

  a.setOnline(false);
  const queued = a.data.createFlower({ ...draft, thought: "Another remembered dinner" });
  assert.equal(a.data.save([queued]), false);
  await a.flush();
  assert.equal(a.data.status.phase, "offline");
  assert.equal(a.data.status.ready, true);
  assert(a.data.status.pending > 0);
  assert.equal(a.data.load().length, 2);

  b.data.setNickname("Bob");
  const other = b.data.createFlower({ ...draft, thought: "A meal with my family" });
  b.data.save([other]);
  await b.flush();
  a.setOnline(true);
  await a.flush();
  assert.equal(a.data.status.pending, 0);
  assert.equal(a.data.load().length, 3, "A write acknowledgement cannot hide a concurrent remote flower");
  await b.flush();
  assert.equal(b.data.load().length, 3);
  assert.equal(b.data.load().filter(record => b.data.isOwn(record)).length, 1);
  const stablePositions = a.data.load().map(record => [record.id, record.position]);
  const grow = a.data.saveBloom(first.id, .8, { source: "keyboard" });
  assert.equal(grow.saved, false);
  await a.flush();
  await b.flush();
  assert.equal(b.data.load().find(record => record.id === first.id).appearance.openness, .8);
  assert.deepEqual(plain(a.data.load().map(record => [record.id, record.position])), plain(stablePositions));

  const restored = client(backend, aStore);
  await restored.data.ready;
  assert.equal(restored.data.getAuthor().id, a.data.getAuthor().id);
  assert.equal(restored.data.load().length, 3);
  assert.equal(restored.data.load().filter(record => restored.data.isOwn(record)).length, 2);

  const cached = JSON.parse(aStore.get(sharedKey));
  cached.token = "expired-token";
  cached.outbox.push({ kind: "create", id: "unverified-queued", record: { ...plain(first), id: "unverified-queued" } });
  const broken = client(backend, new Map([[sharedKey, JSON.stringify(cached)]]));
  await broken.data.ready;
  assert.equal(broken.data.status.ready, false);
  assert.equal(broken.data.status.phase, "error");
  assert.equal(broken.data.createFlower(draft), null);
  const previousSessions = backend.sessions.size;
  await broken.flush();
  assert.equal(backend.sessions.size, previousSessions, "Invalid identity cannot be silently replaced");
  assert.equal(broken.data.status.pending, 1);
  assert.equal(backend.flowers.has("unverified-queued"), false);

  const local = client(backend, new Map([[localKey, privateValue]]), "file:");
  await local.data.ready;
  assert.equal(local.data.isShared, false);
  assert.equal(local.data.load()[0].id, privateRecord.id);
  const staticPreview = client({ async fetch() { return { status: 404, ok: false, async json() { return {}; } }; } }, new Map([[localKey, privateValue]]));
  await staticPreview.data.ready;
  assert.equal(staticPreview.data.isShared, false);
  assert.equal(staticPreview.data.load()[0].id, privateRecord.id);

  const names = client(backend);
  await names.data.ready;
  names.setOnline(false);
  names.data.setNickname("First nickname");
  const firstName = names.data.createFlower({ ...draft, thought: "First queued nickname snapshot" });
  names.data.save([firstName]);
  names.data.setNickname("Second nickname");
  const secondName = names.data.createFlower({ ...draft, thought: "Second queued nickname snapshot" });
  names.data.save([secondName]);
  names.setOnline(true);
  await names.flush();
  assert.equal(names.data.getAuthor().name, "Second nickname");
  assert.equal(names.data.load().find(record => record.id === firstName.id).author.name, "First nickname");
  assert.equal(names.data.load().find(record => record.id === secondName.id).author.name, "Second nickname");
  console.log("PASS: independent identities, private/local isolation, canonical placement, owner-only growth, offline outbox, concurrent writes, refresh restore, invalid-token protection, and local/static compatibility.");
})().catch(error => { console.error(error); process.exitCode = 1; });
