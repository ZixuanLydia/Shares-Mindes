// Same-origin multiplayer transport. The file:// garden remains fully local.
// Only the dedicated garden server activates this adapter; static previews do not.
(() => {
  "use strict";
  const key = "secret-garden:shared:v1";
  const listeners = new Set();
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  const http = /^https?:$/.test(window.location?.protocol ?? "");
  let validator = value => value;
  let mergeGrowth = (...lists) => lists.flat();
  let author = null;
  let token = "";
  let confirmed = [];
  let outbox = [];
  let nicknamePending = null;
  let revision = -1;
  let running = false;
  let runningPromise = null;
  let configured = false;
  let timer = null;
  let retryAt = 0;
  let failures = 0;
  let sessionVerified = false;
  let state = { mode: http ? "checking" : "local", phase: http ? "checking" : "local", ready: !http, pending: 0, message: "" };
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  if (!http) resolveReady(false);

  function validPosition(value) {
    return Boolean(value && Number.isFinite(value.x) && value.x >= .08 && value.x <= .96
      && Number.isFinite(value.y) && value.y >= .22 && value.y <= .82
      && Number.isFinite(value.z) && value.z >= -16 && value.z <= 16);
  }

  function readStored() {
    try {
      const stored = JSON.parse(window.localStorage.getItem(key));
      return stored?.version === 1 ? stored : null;
    } catch { return null; }
  }

  function records() {
    const byId = new Map(confirmed.map(record => [record.id, clone(record)]));
    for (const operation of outbox) {
      if (operation.kind === "create") {
        if (!byId.has(operation.id)) byId.set(operation.id, clone(operation.record));
      } else if (operation.kind === "position") {
        const record = byId.get(operation.id);
        if (record) record.position = clone(operation.position);
      } else {
        const record = byId.get(operation.id);
        if (!record) continue;
        record.appearance.openness = Math.max(record.appearance.openness, operation.openness);
        record.growth = mergeGrowth(record.growth, operation.growth);
      }
    }
    return Array.from(byId.values());
  }

  function status() {
    return { ...state, pending: outbox.length + (nicknamePending !== null ? 1 : 0), author: clone(author) };
  }

  function notify(next = {}) {
    state = { ...state, ...next };
    const snapshot = { ...status(), flowers: records() };
    for (const listener of listeners) {
      try { listener(clone(snapshot)); } catch (error) { console.warn("Shared garden listener failed.", error); }
    }
  }

  function persist() {
    try {
      window.localStorage.setItem(key, JSON.stringify({ version: 1, token, author, flowers: confirmed, outbox, nicknamePending, revision }));
      return true;
    } catch { return false; }
  }

  function accepted(values) {
    return Array.isArray(values) ? values.map(validator).filter(Boolean) : [];
  }

  function acceptRecord(value) {
    const record = validator(value);
    if (!record) throw new Error("The shared garden returned an invalid flower.");
    const index = confirmed.findIndex(item => item.id === record.id);
    if (index >= 0) confirmed[index] = record;
    else confirmed.push(record);
    return record;
  }

  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(path, {
        ...options,
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: "Bearer " + token } : {}), ...options.headers }
      });
      if (response.status === 304) return { unchanged: true };
      let body;
      try { body = await response.json(); } catch { body = {}; }
      if (!response.ok) {
        const error = new Error(body.error?.message || body.error || "The shared garden is unavailable.");
        error.status = response.status;
        throw error;
      }
      return body;
    } finally { clearTimeout(timeout); }
  }

  async function restoreSession() {
    const submittedNickname = nicknamePending;
    const body = submittedNickname !== null ? { nickname: submittedNickname } : {};
    const result = await request("/api/session", { method: "POST", body: JSON.stringify(body) });
    if (typeof result.token !== "string" || !result.author?.id || !result.author?.name) throw new Error("The shared garden could not restore this gardener.");
    if (author && author.id !== result.author.id && outbox.length) throw Object.assign(new Error("The shared garden returned a different gardener for pending work."), { status: 401 });
    token = result.token;
    author = { id: result.author.id, name: nicknamePending !== submittedNickname && nicknamePending !== null ? nicknamePending : result.author.name };
    if (nicknamePending === submittedNickname) nicknamePending = null;
    sessionVerified = true;
    persist();
  }

  async function pull() {
    const result = await request("/api/garden", { headers: revision >= 0 ? { "If-None-Match": '"garden-' + revision + '"' } : {} });
    if (result.unchanged) return;
    if (!Array.isArray(result.flowers) || !Number.isFinite(result.revision)) throw new Error("The shared garden returned an invalid snapshot.");
    confirmed = accepted(result.flowers);
    revision = result.revision;
    persist();
  }

  async function push() {
    while (nicknamePending !== null) await restoreSession();
    while (outbox.length) {
      // Capture an immutable request. A newer local edit can append safely while
      // this request is waiting for the server acknowledgement.
      const operation = outbox[0];
      let result;
      if (operation.kind === "create") {
        const record = clone(operation.record);
        // Ownership comes from the credential. The nickname remains the
        // snapshot chosen for this flower, including a delayed offline plant.
        record.author = { id: author.id, name: record.author.name };
        result = await request("/api/flowers", { method: "POST", body: JSON.stringify(record) });
      } else if (operation.kind === "position") {
        result = await request("/api/flowers/" + encodeURIComponent(operation.id) + "/position", {
          method: "PATCH", body: JSON.stringify({ position: operation.position })
        });
      } else {
        result = await request("/api/flowers/" + encodeURIComponent(operation.id) + "/bloom", {
          method: "PATCH", body: JSON.stringify({ openness: operation.openness, growth: operation.growth })
        });
      }
      acceptRecord(result.flower);
      // Do not advance the snapshot revision using a single write response: a
      // concurrent remote flower may not be in our current snapshot yet.
      if (outbox[0] === operation) outbox.shift();
      persist();
      notify({ phase: "online", ready: true, message: "" });
    }
  }

  function schedule(delay = 1200) {
    clearTimeout(timer);
    if (state.mode !== "shared") return;
    timer = setTimeout(cycle, delay);
  }

  function cycle() {
    if (runningPromise) return runningPromise;
    runningPromise = runCycle().finally(() => { runningPromise = null; });
    return runningPromise;
  }

  async function runCycle() {
    if (running || state.mode !== "shared") return;
    if (Date.now() < retryAt) { schedule(retryAt - Date.now()); return; }
    running = true;
    try {
      if (!token || !author || !sessionVerified) await restoreSession();
      await push();
      await pull();
      failures = 0;
      retryAt = 0;
      notify({ phase: "online", ready: true, message: "" });
    } catch (error) {
      failures += 1;
      // Invalid credentials must not silently turn queued works into another
      // person's flowers. Keep the outbox and identity for an explicit retry.
      const unauthorized = error.status === 401 || error.status === 403 || error.status === 409 || error.status === 400;
      if (error.status === 401) sessionVerified = false;
      retryAt = Date.now() + Math.min(15000, 1200 * 2 ** Math.min(failures - 1, 4));
      notify({ phase: unauthorized ? "error" : "offline", ready: Boolean(author && token) && error.status !== 401,
        message: error.status === 401 ? "This gardener could not be verified. Pending work stays on this device; try reconnecting to the original garden."
          : unauthorized ? "This flower could not be shared. Your pending work stays on this device." : "Connection paused. Pending flowers will be shared when the garden reconnects." });
    } finally {
      running = false;
      schedule(Math.max(1200, retryAt - Date.now()));
    }
  }

  async function start() {
    if (!http) { notify(); return false; }
    const stored = readStored();
    if (stored) {
      token = typeof stored.token === "string" ? stored.token : "";
      author = stored.author?.id && stored.author?.name ? { id: stored.author.id, name: stored.author.name } : null;
      confirmed = accepted(stored.flowers);
      outbox = Array.isArray(stored.outbox) ? stored.outbox.filter(operation => operation && typeof operation.id === "string"
        && (operation.kind === "create" ? Boolean(validator(operation.record))
          : operation.kind === "position" ? validPosition(operation.position)
            : operation.kind === "bloom" && Number.isFinite(operation.openness))).map(clone) : [];
      nicknamePending = typeof stored.nicknamePending === "string" ? stored.nicknamePending : null;
      // A server may have been restored from an older database; get one complete
      // snapshot before using revision-based conditional requests again.
      revision = -1;
    }
    try {
      const snapshot = await request("/api/garden");
      if (!Array.isArray(snapshot.flowers) || !Number.isFinite(snapshot.revision)) throw Object.assign(new Error("Not a shared garden server."), { status: 404 });
      state.mode = "shared";
      confirmed = accepted(snapshot.flowers);
      revision = snapshot.revision;
      notify({ phase: "connecting", ready: false, message: "Joining the shared garden…" });
      await restoreSession();
      persist();
      notify({ phase: "online", ready: true, message: "" });
      resolveReady(true);
      schedule(0);
      return true;
    } catch (error) {
      if (!stored && (error.status === 404 || error.status === 405)) {
        // Ordinary static HTTP previews continue to work as the local prototype.
        // A known shared garden never drops into local mode after a network loss.
        token = ""; author = null; confirmed = []; outbox = []; nicknamePending = null;
        notify({ mode: "local", phase: "local", ready: true, message: "" });
        resolveReady(false);
        return false;
      }
      notify({ mode: "shared", phase: error.status === 401 ? "error" : "offline", ready: Boolean(author && token) && error.status !== 401,
        message: error.status === 401 ? "This gardener could not be verified. Pending work stays on this device; try reconnecting to the original garden."
          : "Connection paused. Your shared garden is available on this device." });
      resolveReady(true);
      schedule(1200);
      return true;
    }
  }

  function queueRecords(values) {
    if (state.mode !== "shared" || !state.ready || !author || !token) return false;
    let changed = false;
    for (const record of accepted(values)) {
      if (record.author.id !== author.id) continue;
      const base = confirmed.find(item => item.id === record.id);
      const creating = outbox.find(operation => operation.kind === "create" && operation.id === record.id);
      if (!base && !creating) {
        outbox.push({ kind: "create", id: record.id, record: clone(record) });
        changed = true;
      } else {
        const current = records().find(item => item.id === record.id);
        if (!current || record.appearance.openness <= current.appearance.openness) continue;
        // Append rather than changing an in-flight idempotent create request.
        outbox.push({ kind: "bloom", id: record.id, openness: record.appearance.openness, growth: clone(record.growth) });
        changed = true;
      }
    }
    if (changed) { persist(); notify(); schedule(0); }
    return !values.some(value => value?.author?.id === author.id && outbox.some(operation => operation.id === value.id));
  }

  function setNickname(name) {
    if (state.mode !== "shared" || !author || !token || typeof name !== "string" || !name.trim() || name.trim().length > 80) return false;
    author = { ...author, name: name.trim() };
    nicknamePending = name.trim();
    const saved = persist();
    notify();
    schedule(0);
    return saved;
  }

  function savePosition(id, position) {
    if (state.mode !== "shared" || !state.ready || !author || !token || !validPosition(position)) return false;
    const record = records().find(flower => flower.id === id);
    if (!record || record.author.id !== author.id) return false;
    if (["x", "y", "z"].every(key => record.position[key] === position[key])) {
      return confirmed.some(record => record.id === id) && !outbox.some(operation => operation.id === id);
    }
    // Append immutable operations: an in-flight acknowledgement cannot erase a
    // later local move, and the overlay always presents the newest queued pose.
    outbox.push({ kind: "position", id, position: clone(position) });
    persist();
    notify();
    schedule(0);
    return false;
  }

  window.GardenShared = {
    configure(options) {
      if (configured) return;
      configured = true;
      validator = options.readRecord;
      mergeGrowth = options.mergeGrowth;
      start();
    },
    ready,
    get status() { return status(); },
    load: () => records(),
    getAuthor: () => clone(author),
    isOwn: record => Boolean(author && record?.author?.id === author.id),
    isConfirmed: id => confirmed.some(record => record.id === id) && !outbox.some(operation => operation.id === id),
    save: queueRecords,
    savePosition,
    setNickname,
    flush() { retryAt = 0; return cycle(); },
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      listener({ ...status(), flowers: records() });
      return () => listeners.delete(listener);
    },
  };
  if (window.addEventListener) {
    window.addEventListener("online", () => { retryAt = 0; schedule(0); });
    window.addEventListener("visibilitychange", () => { if (!document.hidden) schedule(0); });
  }
})();
