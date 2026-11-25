// Exercise the production snapshot boundary without a renderer or browser.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(__dirname + "/garden.js", "utf8");
const start = source.indexOf("  function receiveSnapshot(state)");
const end = source.indexOf("  function drawMotes(time)", start);
assert(start > 0 && end > start, "Snapshot boundary exists in the real scene controller");
const plain = value => JSON.parse(JSON.stringify(value));
const frozen = value => {
  Object.freeze(value);
  for (const child of Object.values(value)) if (child && typeof child === "object" && !Object.isFrozen(child)) frozen(child);
  return value;
};
const flower = (id, owner = "alice", openness = .2) => frozen({
  id, author: { id: owner, name: owner === "alice" ? "Alice" : "Bob" },
  thought: "Thought " + id, associations: ["Stillness"],
  appearance: { color: "peach", form: "cup", openness, size: .4 },
  position: { x: .7, y: .6, z: .3 }, createdAt: "2026-11-18T12:00:00.000Z", growth: [],
});
class Target {
  constructor() { this.attributes = new Map(); this.tag = {}; }
  toggleAttribute(name, state) { state ? this.attributes.set(name, "") : this.attributes.delete(name); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  hasAttribute(name) { return this.attributes.has(name); }
  querySelector() { return this.tag; }
}
let now = 100;
const badge = { hidden: false, dataset: {} };
const counters = { registered: 0, history: 0, sort: 0, hints: 0, permissions: 0, detail: 0, focus: 0 };
const notices = [];
const state = { mode: "checking", phase: "checking", ready: false, pending: 0 };
const context = {
  window: { GardenData: {
    get status() { return state; },
    get isShared() { return state.mode === "shared"; },
    isOwn: record => record.author.id === "alice",
  } },
  plants: [], focus: { active: false }, plant: { draft: null,
    announce: text => notices.push(text),
    refreshDetailAccess: () => counters.permissions++,
    showDetail: () => counters.detail++,
  },
  history: { refresh: () => counters.history++ },
  detailPanel: { hidden: true }, selectedFlower: null, returnToHistoryId: null,
  document: { activeElement: { isConnected: true, focus: () => counters.focus++ } },
  reducedMotion: { matches: false }, performance: { now: () => now },
  bloomDrag: null, positionDrag: null, pendingSnapshot: null, snapshotSignature: "", previousPending: 0,
  byId: id => { assert.equal(id, "shared-state"); return badge; },
  clamp: (value, low, high) => Math.max(low, Math.min(high, value)),
  mix: (a, b, t) => a + (b - a) * t,
  sortFlowers: () => counters.sort++, updateSceneHint: () => counters.hints++,
};
context.registerPlant = record => {
  counters.registered++;
  const target = new Target();
  const entry = { record, target, ordinal: context.plants.length + 1, raster: { existing: true } };
  context.plants.push(entry);
  return entry;
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);
const snapshot = (flowers, changes = {}) => {
  Object.assign(state, changes);
  context.receiveSnapshot({ ...state, flowers });
};
const a = flower("a");
const b = flower("b", "bob");
// Cached shared records may load before the HTTP probe restores a session.
snapshot([a, b]);
assert.equal(context.plants.length, 2);
assert.equal(badge.hidden, true);
assert.equal(context.canGrowRecord(a), false);
assert.equal(context.canGrowRecord(b), false);
assert.equal(context.plants[1].target.hasAttribute("data-can-grow"), false);
snapshot([a, b], { mode: "shared", phase: "online", ready: true });
assert.equal(badge.textContent, "Shared garden");
assert.equal(context.canGrowRecord(a), true);
assert.equal(context.canGrowRecord(b), false);
assert.equal(context.plants[0].target.hasAttribute("data-can-grow"), true);
assert.equal(context.plants[1].target.hasAttribute("aria-keyshortcuts"), false);
assert.equal(context.plants[0].target.tag.textContent, "Alice", "Cached targets acquire author labels when the HTTP probe confirms shared mode");
assert.equal(context.plants[1].target.title, "Bob · Thought b");
assert.equal(counters.registered, 2, "A status-only update never duplicates targets");
const originalA = context.plants[0];
const originalTarget = originalA.target;
const originalRaster = originalA.raster;

// A new remote thought becomes matchable while the current cinematic pose stays
// intact. Canvas/normal targets are registered only after focus returns.
context.focus.active = true;
const c = flower("c", "bob");
snapshot([a, b, c]);
assert.equal(context.plants.length, 2);
const focusEntries = context.listFocusEntries();
assert.deepEqual(plain(focusEntries.map(entry => entry.record.id)), ["a", "b", "c"]);
assert.equal(focusEntries[0], originalA);
assert.equal(focusEntries[2].target, undefined);
assert.equal(focusEntries[2].raster, null);
assert.equal(focusEntries[2].ordinal, 3);
assert.equal(context.plants[0].raster, originalRaster);
context.focus.active = false;
context.applyPendingSnapshot();
assert.equal(context.plants.length, 3);
assert.equal(context.plants[2].target.tag.textContent, "Bob");
assert.equal(context.plants[2].target.title, "Bob · Thought c");
assert.equal(context.plants[2].target.hasAttribute("data-can-grow"), false);
assert.equal(context.plants[0].target, originalTarget);
assert.equal(context.pendingSnapshot, null);

// Drafts and active bloom drags defer snapshots; the latest full snapshot wins.
context.plant.draft = { thought: "A draft remains untouched" };
snapshot([flower("a", "alice", .4), b, c]);
snapshot([flower("a", "alice", .7), b, c]);
assert.equal(context.plants[0].record.appearance.openness, .2);
assert.equal(context.plant.draft.thought, "A draft remains untouched");
context.plant.draft = null;
context.bloomDrag = { entry: originalA };
context.applyPendingSnapshot();
assert.equal(context.plants[0].record.appearance.openness, .2);
context.bloomDrag = null;
context.applyPendingSnapshot();
assert.equal(context.plants[0].record.appearance.openness, .7);
assert.equal(context.plants[0].raster, null, "Bloom changes invalidate the cached flower image");
assert.equal(context.plants[0].target, originalTarget);

// Position drags also hold incoming server records without disturbing the live
// pointer pose. The latest full snapshot is applied after the gesture ends.
context.positionDrag = { entry: originalA, active: true, position: { x: .8, y: .7, z: .3 } };
snapshot([flower("a", "alice", .8), b, c]);
assert.equal(originalA.record.appearance.openness, .7);
assert.deepEqual(plain(context.displayedPosition(originalA)), { x: .8, y: .7, z: .3 });
context.positionDrag = null;
context.applyPendingSnapshot();
assert.equal(originalA.record.appearance.openness, .8);
assert.equal(context.pendingSnapshot, null);

// Server-confirmed position corrections ease from the existing position rather
// than teleporting; no input record is mutated by presentation state.
const moved = plain(context.plants[0].record);
moved.position = { x: .8, y: .5, z: -.2 };
frozen(moved);
snapshot([moved, b, c]);
assert.deepEqual(plain(context.displayedPosition(originalA)), { x: .7, y: .6, z: .3 });
now += 425;
const midpoint = context.displayedPosition(originalA);
assert(Math.hypot(midpoint.x - .75, midpoint.y - .55, midpoint.z - .05) < 1e-10);
now += 425;
assert.deepEqual(plain(context.displayedPosition(originalA)), moved.position);
assert.equal(originalA.positionTransition, null);

// A selected detail updates without moving keyboard focus. Pure status changes
// update edit permissions and the sync badge even if the record signature stays.
context.selectedFlower = "a";
context.detailPanel.hidden = false;
const altered = plain(moved);
altered.author.name = "Alice II";
snapshot([frozen(altered), b, c]);
assert.equal(counters.detail, 1);
assert.equal(counters.focus, 1);
snapshot([altered, b, c], { phase: "offline", ready: true, pending: 1 });
assert.equal(badge.textContent, "Waiting to share · 1");
assert.equal(context.canGrowRecord(altered), true, "Verified cached owner can queue offline edits");
snapshot([altered, b, c], { phase: "error", ready: false });
assert.equal(badge.textContent, "Sync needs attention");
assert.equal(context.canGrowRecord(altered), false);
assert.equal(context.plants[0].target.hasAttribute("data-can-grow"), false);
assert.equal(counters.permissions > 0, true);
snapshot([altered, b, c], { phase: "online", ready: true, pending: 0 });
assert.equal(notices.at(-1), "Your flowers are shared with the garden.");
snapshot([altered, b, c], { mode: "local", phase: "local", ready: true });
assert.equal(context.canGrowRecord(b), true, "Legacy local flowers retain their original editing behavior");
assert.equal(badge.hidden, true);
assert.equal(counters.registered, 3);
console.log("Passed checking-state ownership, live snapshot defer/coalescing, focus discovery, stable targets, position easing, detail focus, sync status and local compatibility.");
