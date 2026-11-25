// Exercise the real garden pointer handlers without a renderer or browser.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(__dirname + "/garden.js", "utf8");
const geometry = fs.readFileSync(__dirname + "/garden-drag.js", "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
const nearPosition = (actual, expected, message) => {
  for (const axis of ["x", "y", "z"]) assert(Math.abs(actual[axis] - expected[axis]) < 1e-10, (message || "Position") + " " + axis);
};
const fragment = (from, to) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert(start >= 0 && end > start, "Expected production handler boundary: " + from);
  return source.slice(start, end);
};

function harness({ shared = false, owner = "alice", openness = .4 } = {}) {
  let now = 1000;
  const saved = [], notices = [], focused = [];
  const documentHandlers = new Map(), windowHandlers = new Map();
  class Target {
    constructor() {
      this.handlers = new Map(); this.attributes = new Map(); this.children = [];
      this.dataset = {}; this.captured = null; this.className = ""; this.offsetHeight = 110;
    }
    addEventListener(type, handler, capture = false) {
      const list = this.handlers.get(type) || [];
      list.push({ handler, capture }); this.handlers.set(type, list);
    }
    setAttribute(key, value) { this.attributes.set(key, String(value)); }
    removeAttribute(key) { this.attributes.delete(key); }
    toggleAttribute(key, on) { on ? this.setAttribute(key, "") : this.removeAttribute(key); }
    getAttribute(key) { return this.attributes.get(key) ?? null; }
    append(value) { this.children.push(value); }
    closest(selector) { return selector === ".flower-target" && this.className.includes("flower-target") ? this : null; }
    setPointerCapture(id) { this.captured = id; }
    hasPointerCapture(id) { return this.captured === id; }
    releasePointerCapture(id) {
      if (!this.hasPointerCapture(id)) return;
      this.captured = null;
      this.emit("lostpointercapture", { pointerId: id });
    }
    getBoundingClientRect() { return { left: 500, top: 300, right: 620, bottom: 430, width: 120, height: 130 }; }
    emit(type, options = {}) {
      const event = { button: 0, isPrimary: true, pointerId: 1, clientX: 575, clientY: 360,
        detail: type === "click" ? 1 : undefined, target: this, prevented: false, stopped: false,
        preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...options };
      if (type === "click") {
        for (const { handler, capture } of garden.handlers.get(type) || []) if (capture) {
          handler(event); if (event.stopped) return event;
        }
      }
      for (const { handler } of this.handlers.get(type) || []) { handler(event); if (event.stopped) break; }
      return event;
    }
  }
  const garden = new Target();
  garden.getBoundingClientRect = () => ({ left: 10, top: 20, width: 1280, height: 800 });
  garden.clientWidth = 1280; garden.clientHeight = 800;
  garden.querySelector = () => ({ getBoundingClientRect: () => ({ bottom: 108 }) });
  const flower = new Target(); flower.className = "flower-target";
  const specimen = { id: "glass-flower", position: { x: .6, y: .49, z: 0 } };
  const record = {
    id: "flower-a", author: { id: owner, name: owner }, thought: "A thought", associations: [],
    appearance: { form: "cup", color: "peach", size: .4, openness },
    position: { x: .7, y: .6, z: .3 }, createdAt: "2026-11-18T12:00:00.000Z", growth: [],
  };
  const context = {
    garden, flower, specimen, plants: [], plantedTargets: { append() {} },
    view: { width: 1280, height: 800, scale: 1 },
    document: { hidden: false, createElement: () => new Target(), addEventListener: (type, handler) => documentHandlers.set(type, handler) },
    window: { addEventListener: (type, handler) => windowHandlers.set(type, handler) },
    performance: { now: () => now }, reducedMotion: { matches: false }, narrowScreen: { matches: false },
    focus: { active: false }, plant: { draft: null, announce: text => notices.push(text), close: () => false },
    history: { close: () => false },
    positionDrag: null, positionReturnUntil: 0, bloomDrag: null, dragClick: null,
    pointer: { x: 0, y: 0 }, look: { x: 0, y: 0 }, previousTime: now,
    selectedFlower: null, returnToHistoryId: null,
    canvas: {}, ctx: { setTransform() {} }, devicePixelRatio: 1, fitBackdrop() {},
    clamp: (value, low, high) => Math.max(low, Math.min(high, value)),
    mix: (a, b, t) => a + (b - a) * t,
    canGrowRecord: record => !shared || record.author.id === "alice",
    sortFlowers() {},
    focusFlower: (entry, event) => focused.push({ id: entry?.record.id ?? specimen.id, detail: event.detail }),
    beginBloomDrag: (entry, event) => { context.bloomCalls++; context.bloomDrag = { entry, pointerId: event.pointerId }; },
    isBloomPointer: (entry, event) => context.bloomDrag?.entry === entry && context.bloomDrag.pointerId === event.pointerId,
    moveBloomDrag() {}, finishBloomDrag() { context.bloomDrag = null; }, bloomCalls: 0,
  };
  context.setSelection = id => {
    if (context.positionDrag && context.positionDrag.id !== id) context.finishPositionDrag(false);
    context.selectedFlower = id;
  };
  context.window.GardenData = {
    isShared: shared,
    savePosition(id, position) {
      const entry = context.plants.find(item => item.record.id === id);
      // The live pose must survive synchronous adapter notifications until the
      // new optimistic record has been handed back to the scene.
      assert.deepEqual(plain(context.displayedPosition(entry)), plain(position));
      const next = { ...entry.record, position: plain(position) };
      saved.push({ id, position: plain(position) });
      return { saved: !shared, pending: shared, record: next };
    },
  };
  vm.createContext(context);
  vm.runInContext(geometry, context);
  context.positionMotion = context.window.GardenPositionDrag;
  vm.runInContext(fragment("  function registerPlant(record)", "  function isBloomPointer(entry, event)"), context);
  vm.runInContext(fragment("  function displayedPosition(entry)", "  function canGrowRecord(record)"), context);
  vm.runInContext(fragment("  function resize()", "  function setBloom(amount)"), context);
  vm.runInContext(fragment("  flower.setAttribute(\"data-can-move\"", "  garden.addEventListener(\"click\", (event) =>"), context);
  vm.runInContext(fragment("  document.addEventListener(\"keydown\"", "  // Reuse the embedded backdrop"), context);
  const entry = context.registerPlant(record);
  entry.raster = { retained: true };
  const pointer = (type, x, y, extra = {}) => entry.target.emit(type, { clientX: x, clientY: y, ...extra });
  return { context, entry, saved, notices, focused, pointer, garden, flower, specimen,
    advance: amount => { now += amount; },
    escape: () => documentHandlers.get("keydown")({ key: "Escape", preventDefault() {} }),
    blur: () => windowHandlers.get("blur")(),
    hide: () => { context.document.hidden = true; documentHandlers.get("visibilitychange")(); },
  };
}

{
  const h = harness();
  h.pointer("pointerdown", 575, 360);
  h.pointer("pointermove", 578, 362);
  assert.equal(h.context.positionDrag.active, false);
  h.pointer("pointerup", 578, 362);
  h.entry.target.emit("click");
  assert.equal(h.focused.length, 1, "A small pointer drift still clicks into Focus");
  assert.equal(h.saved.length, 0);
}
{
  const h = harness();
  const before = plain(h.entry.record);
  h.pointer("pointerdown", 575, 360);
  h.pointer("pointermove", 703, 440);
  assert.equal(h.context.selectedFlower, h.entry.record.id, "The first drag works without prior selection");
  assert.equal(h.context.positionDrag.active, true);
  nearPosition(h.context.displayedPosition(h.entry), { x: .8, y: .7, z: .3 });
  assert.deepEqual(plain(h.entry.record), before, "Moving is a presentation preview before release");
  h.pointer("pointerup", 703, 440);
  assert.equal(h.saved.length, 1);
  nearPosition(h.entry.record.position, { x: .8, y: .7, z: .3 });
  assert.equal(h.entry.raster.retained, true, "Saving never blanks the cached flower for a frame");
  assert.equal(h.entry.positionBackdropDirty, true);
  assert.equal(h.entry.target.captured, null);
  h.entry.target.emit("click");
  assert.equal(h.focused.length, 0, "The pointer click synthesized after moving never opens Focus");
  h.entry.target.emit("click", { detail: 0 });
  assert.equal(h.focused.length, 1, "Keyboard activation remains available");
}
for (const cancel of ["pointercancel", "lostpointercapture", "escape", "blur", "hide", "resize"]) {
  const h = harness();
  h.pointer("pointerdown", 575, 360);
  h.pointer("pointermove", 703, 440);
  if (cancel === "pointercancel") h.pointer("pointercancel", 703, 440);
  else if (cancel === "lostpointercapture") h.entry.target.releasePointerCapture(1);
  else if (cancel === "resize") h.context.resize();
  else h[cancel]();
  assert.equal(h.saved.length, 0, cancel + " never saves a preview");
  assert.equal(h.context.positionDrag, null, cancel + " clears the pointer gesture");
  assert.equal(h.entry.target.captured, null, cancel + " releases capture");
  nearPosition(h.context.displayedPosition(h.entry), { x: .8, y: .7, z: .3 });
  h.advance(850);
  nearPosition(h.context.displayedPosition(h.entry), { x: .7, y: .6, z: .3 });
}
{
  const h = harness({ shared: true, owner: "bob" });
  h.pointer("pointerdown", 575, 360);
  h.pointer("pointermove", 703, 440);
  h.pointer("pointerup", 703, 440);
  assert.equal(h.saved.length, 0, "Another author's flower never writes position");
  nearPosition(h.entry.record.position, { x: .7, y: .6, z: .3 });
  nearPosition(h.context.displayedPosition(h.entry), { x: .8, y: .7, z: .3 });
  h.advance(425);
  const middle = h.context.displayedPosition(h.entry);
  assert(Math.abs(middle.x - .75) < 1e-10 && Math.abs(middle.y - .65) < 1e-10);
  h.advance(425);
  nearPosition(h.context.displayedPosition(h.entry), { x: .7, y: .6, z: .3 });
}
{
  const h = harness();
  h.flower.emit("pointerdown", { clientX: 575, clientY: 360 });
  h.flower.emit("pointermove", { clientX: 703, clientY: 440 });
  h.flower.emit("pointerup", { clientX: 703, clientY: 440 });
  nearPosition(h.specimen.position, { x: .7, y: .59, z: 0 });
  assert.equal(h.saved.length, 0, "The demo stays for this visit and never creates a saved record");
  h.flower.emit("click");
  assert.equal(h.focused.length, 0);
}
{
  const own = harness();
  own.pointer("pointerdown", 575, 360, { shiftKey: true });
  assert.equal(own.context.bloomCalls, 1);
  assert.equal(own.context.positionDrag, null);
  assert.equal(own.context.selectedFlower, own.entry.record.id);
  const visitor = harness({ shared: true, owner: "bob" });
  visitor.pointer("pointerdown", 575, 360, { shiftKey: true });
  assert.equal(visitor.context.bloomCalls, 0, "Shift cannot bloom another author's flower");
  assert(visitor.context.positionDrag, "A visitor can still explore with an ordinary temporary drag");
}
console.log("Passed production garden pointer intent, first-drag/off-center movement, optimistic save continuity, demo movement, other-author return, cancellation/capture cleanup, and Shift bloom dispatch.");
