const assert = require("node:assert/strict");
global.window = {};
require("./connection-motion.js");
require("./connection-drag.js");

class Hit {
  constructor() {
    this.handlers = new Map();
    this.captured = false;
  }

  addEventListener(type, handler) { this.handlers.set(type, handler); }
  hasPointerCapture() { return this.captured; }
  setPointerCapture() { this.captured = true; }
  releasePointerCapture() { this.captured = false; }
  setAttribute() {}
  removeAttribute() {}
  emit(type, x, y) {
    this.handlers.get(type)({ clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, detail: 1 });
  }
}

function harness(mobile, reducedMotion = false) {
  const scene = {
    width: mobile ? 390 : 1280,
    height: mobile ? 760 : 720,
    mobile,
    planted: () => ({ yaw: 0, pitch: 0 })
  };
  const motion = window.GardenConnectionMotion;
  const entry = (id, form, color, z, openness) => ({ record: { id, appearance: { form, color, openness }, position: { z } } });
  const hub = motion.clusterPose(entry("hub", "flared", "peach", 0, 1), scene);
  const partner = motion.clusterPose(entry("partner", "tall", "blue", 0.5, 0.2), scene, 1);
  let frames = new Map([["hub", hub], ["partner", partner]]);
  const original = JSON.stringify([...frames]);
  const changed = [];
  const drag = window.GardenConnectionDrag.create(
    { getBoundingClientRect: () => ({ ...scene, left: 0, top: 0 }) },
    { matches: reducedMotion },
    id => changed.push(id)
  );
  const hit = new Hit();
  let selected = 0;
  drag.bind(hit, "partner", () => ({ frames, scene, hubId: "hub" }), () => selected++);
  const play = milliseconds => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 10) {
      frames = new Map([["hub", hub], ["partner", partner]]);
      drag.apply(frames, "hub", scene, 10);
    }
  };
  const amount = () => frames.get("hub").fusion?.amount ?? 0;
  const location = () => {
    const p = frames.get("partner");
    return { x: p.x, y: p.y };
  };
  const locationNear = expected => {
    const actual = location();
    assert(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 1e-8,
      "crown location must remain within floating-point precision of its target");
  };
  const home = { x: partner.x, y: partner.y };
  const contact = { x: hub.x, y: hub.y };
  const down = () => hit.emit("pointerdown", home.x, home.y);
  const move = point => hit.emit("pointermove", point.x, point.y);
  const up = point => hit.emit("pointerup", point.x, point.y);

  down();
  up(home);
  hit.emit("click");
  assert.equal(selected, 1);

  const justOutside = {
    x: hub.x + (partner.x - hub.x) * 0.87,
    y: hub.y + (partner.y - hub.y) * 0.87
  };
  down();
  move(justOutside);
  play(800);
  assert.equal(amount(), 0);
  up(justOutside);
  hit.emit("click");
  assert.equal(selected, 1);
  play(1300);
  locationNear(home);
  assert.deepEqual(changed, []);

  down();
  move(contact);
  assert.equal(drag.fusedId, "partner");
  assert.deepEqual(changed, ["partner"]);
  // Release in the same frame as contact. Joining should still complete and persist.
  up(contact);
  hit.emit("click");
  assert.equal(hit.captured, false);
  assert.equal(selected, 1);
  play(10);
  assert(amount() > 0);
  if (!reducedMotion) assert(amount() < 0.03, "animated start");
  play(1800);
  const fused = frames.get("hub").fusion;
  assert.equal(fused.amount, 1);
  assert.equal(fused.light, 1);
  assert.equal(fused.appearance.color, "blue");
  assert.equal(frames.get("partner").fusionOwner, "hub");
  assert.equal(frames.get("partner").weight, 1);
  assert(frames.get("partner").openness > 0.99);
  assert(Number.isFinite(fused.contactAngle));
  const meeting = location();
  hit.emit("pointerdown", contact.x, contact.y);
  hit.emit("pointerup", contact.x, contact.y);
  hit.emit("click");
  assert.equal(selected, 1);
  assert.equal(drag.fusedId, "partner");

  assert.equal(drag.split(), true);
  assert.equal(drag.fusedId, null);
  assert.equal(drag.split(), false);
  assert.deepEqual(changed, ["partner", null]);
  play(210);
  if (!reducedMotion) {
    assert(amount() > 0.35 && amount() < 0.55, "gradual split");
    locationNear(meeting);
    play(200);
    assert.equal(amount(), 0);
    locationNear(meeting);
    play(400);
    const mid = location();
    assert(mid.y < (meeting.y + home.y) / 2 - 7, "curved return");
  }
  play(950);
  locationNear(home);
  assert.equal(JSON.stringify([...frames]), original);

  down();
  // A final pointer-up may carry the first sample on the large crown.
  up(contact);
  play(850);
  assert.equal(drag.fusedId, "partner");
  assert.equal(amount(), 1);
  drag.clear();
  play(10);
  locationNear(home);
  assert.deepEqual(changed, ["partner", null, "partner", null]);
}

harness(false);
harness(true);
harness(true, true);
console.log("Contact, release, held display, split, arc, and quick drop passed on desktop, narrow, and reduced motion.");
