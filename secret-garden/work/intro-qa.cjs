// Exercise the real, private welcome controller with a deterministic DOM clock.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(__dirname + "/intro.js", "utf8");
const css = fs.readFileSync(__dirname + "/intro.css", "utf8");

function harness({ stored = new Map(), hidden = false, reduced = false, unavailableStorage = false } = {}) {
  let now = 0, nextTimer = 0;
  const timers = new Map();
  function emitter() {
    const listeners = new Map();
    return {
      addEventListener(type, listener, options) {
        const entries = listeners.get(type) || [];
        entries.push({ listener, once: Boolean(options?.once) });
        listeners.set(type, entries);
      },
      removeEventListener(type, listener) {
        listeners.set(type, (listeners.get(type) || []).filter(entry => entry.listener !== listener));
      },
      emit(type, event = {}) {
        for (const entry of [...(listeners.get(type) || [])]) {
          entry.listener(event);
          if (entry.once) this.removeEventListener(type, entry.listener);
        }
      },
      count(type) { return (listeners.get(type) || []).length; }
    };
  }
  const intro = {};
  const garden = {
    dataset: {}, attributes: new Map(),
    querySelector: selector => selector === ".intro" ? intro : null,
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
  };
  const document = Object.assign(emitter(), { hidden, getElementById: id => id === "garden" ? garden : null });
  const motion = Object.assign(emitter(), { matches: reduced });
  const sessionStorage = {
    getItem(key) { if (unavailableStorage) throw Error("Storage disabled"); return stored.get(key) || null; },
    setItem(key, value) { if (unavailableStorage) throw Error("Storage disabled"); stored.set(key, String(value)); },
  };
  const context = {
    document, matchMedia: () => motion, sessionStorage,
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, at: now + Math.max(0, delay || 0) }); return id; },
    clearTimeout(id) { timers.delete(id); },
    performance: { now: () => now },
  };
  context.requestAnimationFrame = callback => context.setTimeout(() => callback(now), 16);
  vm.runInNewContext(source, context, { filename: "intro.js" });
  return {
    garden, document, motion, timers, stored,
    phase: () => garden.dataset.introPhase,
    tick(milliseconds) {
      const end = now + milliseconds;
      let count = 0;
      for (;;) {
        const next = [...timers.entries()].filter(([, item]) => item.at <= end)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        assert(++count < 10000, "The welcome must not schedule an unbounded loop");
        const [id, item] = next;
        timers.delete(id); now = item.at; item.callback();
      }
      now = end;
    },
    visibility(value) { document.hidden = value; document.emit("visibilitychange"); },
    interact(type = "pointerdown") {
      document.emit(type, {
        target: { tagName: "INPUT" },
        preventDefault() { assert.fail("The welcome must never block a garden action"); },
        stopPropagation() { assert.fail("The welcome must never consume a garden action"); },
        stopImmediatePropagation() { assert.fail("The welcome must never consume a garden action"); },
      });
    },
  };
}

const key = "secret-garden:intro:v1";
{
  const first = harness();
  assert.equal(first.phase(), "waiting");
  assert.equal(first.stored.has(key), false);
  first.tick(40);
  assert.equal(first.phase(), "visible");
  assert.equal(first.stored.has(key), false, "The welcome does not write storage");
  first.tick(1960);
  assert.equal(first.phase(), "visible", "The title has a brief readable hold");
  first.tick(100);
  assert.equal(first.phase(), "leaving");
  first.tick(1000);
  assert.equal(first.phase(), "finished");
  assert.equal(first.timers.size, 0);
  assert.equal(first.document.count("pointerdown"), 0);
  assert.equal(first.document.count("keydown"), 0);
  first.visibility(true); first.visibility(false); first.interact(); first.tick(5000);
  first.garden.dataset.focusPhase = "focused";
  delete first.garden.dataset.focusPhase;
  assert.equal(first.phase(), "finished", "Closing focus must not resurrect the title");

  first.stored.set(key, "seen");
  first.stored.set("secret-garden:v1", "existing flowers");
  const beforeRefresh = [...first.stored];
  for (let load = 0; load < 2; load++) {
    const refreshed = harness({ stored: first.stored });
    assert.equal(refreshed.phase(), "waiting", "Every refresh begins the title, even with an old seen marker");
    refreshed.tick(40);
    assert.equal(refreshed.phase(), "visible");
    refreshed.tick(3100);
    assert.equal(refreshed.phase(), "finished");
    assert.deepEqual([...first.stored], beforeRefresh, "Replaying the title leaves saved records untouched");
  }
}

for (const type of ["pointerdown", "keydown"]) {
  const h = harness();
  let actionContinued = false;
  h.document.addEventListener(type, () => { actionContinued = true; });
  h.tick(40); h.interact(type);
  assert.equal(actionContinued, true);
  assert.equal(h.phase(), "leaving");
  assert(h.garden.attributes.has("data-intro-skipped"));
  h.tick(200);
  assert.equal(h.phase(), "finished", "An interaction dismisses the welcome promptly");
}

{
  const h = harness({ hidden: true });
  h.tick(10000);
  assert.equal(h.phase(), "waiting");
  assert.equal(h.stored.has(key), false);
  h.visibility(false); h.tick(40);
  assert.equal(h.phase(), "visible");
  h.visibility(true);
  assert.equal(h.phase(), "finished", "A partly seen welcome does not resume over later work");
  h.visibility(false); h.tick(5000);
  assert.equal(h.phase(), "finished");
}

{
  const h = harness({ reduced: true });
  assert.equal(h.phase(), "finished", "Reduced motion skips the entrance animation");
  assert.equal(h.timers.size, 0);
  const changing = harness(); changing.tick(40);
  changing.motion.matches = true; changing.motion.emit("change");
  assert.equal(changing.phase(), "finished");
}

{
  const h = harness({ unavailableStorage: true });
  h.tick(40); assert.equal(h.phase(), "visible");
  h.interact(); h.tick(200);
  assert.equal(h.phase(), "finished", "Disabled storage cannot prevent garden access");
  const early = harness(); early.interact(); early.tick(5000);
  assert.equal(early.phase(), "finished", "Input before the first frame cannot cause a late title");
}

assert(/#garden\s*>\s*\.intro\s*\{[^}]*opacity:\s*0[\s\S]*?pointer-events:\s*none/.test(css), "The default welcome must not flash or intercept input");
const finishedRule = css.match(/#garden\[data-intro-phase="finished"\]\s*>\s*\.intro\s*\{([^}]+)\}/)?.[1];
assert(finishedRule && /clip-path:\s*inset\(50%\)/.test(finishedRule));
assert(!/display:\s*none|visibility:\s*hidden/.test(finishedRule), "Keep the heading available to the main landmark");
assert(!/\b(?:localStorage|sessionStorage)\b/.test(source), "The welcome never accesses flower or session storage");
console.log("Passed repeat-refresh playback, unchanged saved records, first-entry timing, one-way completion, non-blocking early input, hidden-tab handling, reduced motion and accessible finished heading.");
