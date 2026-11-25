const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function dom() {
  const document = { activeElement: null };
  class Element {
    constructor(tag = "div") {
      this.tagName = tag;
      this.children = [];
      this.attributes = new Map();
      this.handlers = new Map();
      this.dataset = {};
      this.style = { setProperty() {} };
      this.hidden = false;
      this.scrollTop = 0;
      this.value = "";
      this.text = "";
    }
    set textContent(value) { this.text = String(value); this.children = []; }
    get textContent() { return this.text + this.children.map(child => typeof child === "string" ? child : child.textContent).join(""); }
    append(...children) {
      for (const child of children) {
        if (child.fragment) this.append(...child.children);
        else { this.children.push(child); if (typeof child !== "string") child.parent = this; }
      }
    }
    replaceChildren(...children) { this.text = ""; this.children = []; this.append(...children); }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    addEventListener(name, fn) { const list = this.handlers.get(name) || []; list.push(fn); this.handlers.set(name, list); }
    emit(name, event = {}) { for (const fn of this.handlers.get(name) || []) fn({ preventDefault() {}, ...event }); }
    focus() { document.activeElement = this; }
    contains(element) { return this === element || this.children.some(child => typeof child !== "string" && child.contains(element)); }
    querySelector(selector) { this.queries ??= new Map(); if (!this.queries.has(selector)) this.queries.set(selector, new Element()); return this.queries.get(selector); }
    reset() {}
    setCustomValidity() {}
    reportValidity() {}
    setPointerCapture() {}
  }
  const elements = new Map();
  document.getElementById = id => {
    if (!elements.has(id)) { const item = new Element(); item.id = id; elements.set(id, item); }
    return elements.get(id);
  };
  document.createElement = tag => new Element(tag);
  document.createDocumentFragment = () => Object.assign(new Element(), { fragment: true });
  const rows = node => node.children.flatMap(child => typeof child === "string" ? [] : [child, ...rows(child)]).filter(child => child.dataset.flowerId);
  return { document, elements, get: document.getElementById, rows };
}

const record = (id, owner, name, day = 18) => ({
  id, author: { id: owner, name }, thought: "Thought " + id,
  associations: ["Stillness"], appearance: { color: "peach", form: "cup", openness: .4, size: .4 },
  position: { x: .7, y: .6, z: .3 }, createdAt: `2026-11-${day}T12:00:00.000Z`,
});
const source = name => fs.readFileSync(__dirname + "/" + name, "utf8");

{
  const ui = dom();
  const alice = record("alice-flower", "alice", "Alice", 17);
  const bob = record("bob-flower", "bob", "Bob");
  let flowers = [alice, bob];
  const data = { isShared: true, isOwn: item => item.author.id === "alice", growthFor: () => [{ source: "planted" }] };
  const context = { window: { GardenData: data }, document: ui.document };
  vm.runInNewContext(source("history.js"), context);
  const selected = [];
  const history = context.window.GardenHistory.setup({ listFlowers: () => flowers, onOpen() {}, onSelect: id => selected.push(id) });
  history.open();
  assert.deepEqual(ui.rows(ui.get("history-list")).map(row => row.dataset.flowerId), ["alice-flower"]);
  assert(ui.get("history-list").textContent.includes("Alice"));
  assert(!ui.get("history-list").textContent.includes("Bob"));
  data.status = { mode: "checking", ready: false };
  data.isShared = false;
  history.refresh();
  assert.deepEqual(ui.rows(ui.get("history-list")).map(row => row.dataset.flowerId), ["alice-flower"]);
  data.status = { mode: "shared", ready: true };
  data.isShared = true;
  ui.get("history-timeline").emit("click");
  assert.deepEqual(ui.rows(ui.get("history-list")).map(row => row.dataset.flowerId), ["bob-flower", "alice-flower"]);
  assert(ui.get("history-list").textContent.includes("Alice"));
  assert(ui.get("history-list").textContent.includes("Bob"));
  const row = ui.rows(ui.get("history-list"))[1];
  row.focus();
  ui.get("history-list").scrollTop = 83;
  row.emit("click");
  assert.deepEqual(selected, ["alice-flower"]);
  flowers.push(record("carol-flower", "carol", "Carol"));
  assert.equal(history.refresh(), true);
  assert.equal(ui.get("history-list").scrollTop, 83);
  assert.equal(ui.document.activeElement.dataset.flowerId, "alice-flower");
  assert.equal(ui.rows(ui.get("history-list")).length, 3);
  // Refresh while a tab has focus does not move it into the list.
  ui.get("history-timeline").focus();
  history.refresh();
  assert.equal(ui.document.activeElement.id, "history-timeline");
  flowers = [bob];
  ui.get("history-my").emit("click");
  assert.equal(ui.rows(ui.get("history-list")).length, 0);
  assert.equal(ui.get("history-empty").hidden, false);
  assert.equal(ui.get("history-count").hidden, true);
  assert.equal(ui.get("history-empty").textContent, "Your planted flowers will appear here.");
  data.isShared = false;
  data.status = { mode: "local", ready: true };
  data.isOwn = () => { throw Error("Local mode must preserve all legacy records."); };
  history.refresh();
  assert.deepEqual(ui.rows(ui.get("history-list")).map(item => item.dataset.flowerId), ["bob-flower"]);
  history.close();
  assert.equal(history.refresh(), false);
}

{
  const ui = dom();
  const data = {
    isShared: true,
    isOwn: item => item.author.id === "alice",
    growthFor: () => [{ source: "planted", at: "2026-11-18T12:00:00.000Z" }],
    getNickname: () => "Alice",
    suggest: () => ["Stillness"],
    growthPoint: (openness, source, at) => ({ id: "point", openness, source, at }),
  };
  const context = { window: { GardenData: data }, document: ui.document, setTimeout: () => 1, clearTimeout() {} };
  vm.runInNewContext(source("plant.js"), context);
  let committed;
  let reply = { target: ui.get("planted-target"), saved: true, pending: true };
  const plant = context.window.GardenPlant.setup({
    onMode() {}, onPlant: draft => { committed = draft; return reply; }, onClearSelection() {}, onBackToHistory() {}, onReplay() {},
  });
  plant.showDetail(record("bob", "bob", "Bob"), 2);
  assert.equal(ui.get("detail-grow-hint").hidden, false);
  assert.equal(ui.get("detail-grow-hint").textContent, "Drag to explore. Release to return this flower.");
  assert.equal(ui.get("detail-title").getAttribute("aria-keyshortcuts"), null);
  assert(ui.get("detail-fields").textContent.includes("Planted byBob"));
  plant.updateDetailBloom(.6, true);
  assert.equal(ui.get("detail-grow-hint").hidden, false);
  assert.equal(ui.get("detail-grow-hint").textContent, "Drag to explore. Release to return this flower.");
  plant.showDetail(record("alice", "alice", "Alice"), 1);
  assert.equal(ui.get("detail-grow-hint").hidden, false);
  assert.equal(ui.get("detail-title").getAttribute("aria-keyshortcuts"), "ArrowUp");
  plant.updateDetailBloom(.6, true);
  data.status = { mode: "checking", ready: false };
  data.isShared = false;
  plant.refreshDetailAccess();
  assert.equal(ui.get("detail-grow-hint").hidden, false);
  assert.equal(ui.get("detail-grow-hint").textContent, "Drag to explore. Release to return this flower.");
  assert.equal(ui.get("detail-title").getAttribute("aria-keyshortcuts"), null);
  data.status = { mode: "shared", ready: true };
  data.isShared = true;
  plant.refreshDetailAccess();
  assert.equal(ui.get("detail-grow-hint").hidden, false);
  assert.equal(ui.get("detail-grow-hint").textContent, "Release to save bloom.");
  plant.updateDetailBloom(1);
  assert.equal(ui.get("detail-grow-hint").hidden, false);
  assert.equal(ui.get("detail-grow-hint").textContent, "Drag to move. Release to save its position.");
  ui.get("open-plant").emit("click");
  assert.equal(ui.get("nickname-input").value, "Alice");
  ui.get("thought-input").value = "A thought to share";
  ui.get("thought-form").emit("submit");
  ui.get("style-next").emit("click");
  ui.get("plant-confirm").emit("click");
  assert.equal(committed.thought, "A thought to share");
  assert.equal(committed.nickname, "Alice");
  assert.equal(ui.get("garden-status").textContent, "Planted locally. Waiting to share…");
  assert.equal(plant.draft, null);
  // Local results retain the original saved/visit wording.
  data.isShared = false;
  data.status = { mode: "local", ready: true };
  reply = { target: ui.get("planted-target"), saved: true };
  ui.get("open-plant").emit("click");
  ui.get("thought-input").value = "Offline thought";
  ui.get("thought-form").emit("submit");
  ui.get("style-next").emit("click");
  ui.get("plant-confirm").emit("click");
  assert.equal(ui.get("garden-status").textContent, "Planted. Click your flower to read your thought.");
  // A connecting/validation error keeps the current draft editable.
  reply = { error: "The garden is connecting. Try again in a moment." };
  ui.get("open-plant").emit("click");
  ui.get("thought-input").value = "Keep this draft";
  ui.get("thought-form").emit("submit");
  ui.get("style-next").emit("click");
  ui.get("plant-confirm").emit("click");
  assert.equal(plant.draft.thought, "Keep this draft");
  assert.equal(ui.get("garden-status").textContent, reply.error);
}

console.log("Passed shared owner-only My Flowers, all-author Timeline, live refresh focus/scroll, read-only visitor details, queued commit messaging, and local-mode compatibility.");
