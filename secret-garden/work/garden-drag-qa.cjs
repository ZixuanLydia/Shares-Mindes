const assert = require("node:assert/strict");
global.window = {};
require("./garden-drag.js");
const drag = window.GardenPositionDrag;
const near = (actual, expected, message) => assert(Math.abs(actual - expected) < 1e-10, message || `${actual} != ${expected}`);
const projectY = value => Math.max(.40, .56 + (value - .49) * .85);

let combinations = 0;
for (const view of [{ width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 1024, height: 700 }]) {
  for (const depth of [-.84, 0, .92, 4]) {
    for (const offset of [{ x: 0, y: 0 }, { x: -31, y: 26 }, { x: 49, y: -18 }]) {
      const from = { x: .53, y: .52, z: depth };
      const pointer = { x: from.x * view.width + offset.x, y: from.y * view.height + offset.y };
      const anchor = drag.start(from, pointer, view);
      const before = JSON.stringify({ from, pointer, anchor });
      for (const amount of [{ x: 0, y: 0 }, { x: 45, y: -60 }, { x: -75, y: 85 }]) {
        const result = drag.move(anchor, { x: pointer.x + amount.x, y: pointer.y + amount.y }, view);
        near(result.x, from.x + amount.x / view.width);
        near(result.y, from.y + amount.y / view.height);
        assert.equal(result.z, depth, "moving on screen preserves the original 3D depth exactly");
        combinations++;
      }
      assert.equal(JSON.stringify({ from, pointer, anchor }), before, "geometry never mutates a record or gesture anchor");
      assert.equal(drag.moved(anchor, { x: pointer.x + 3, y: pointer.y + 4 }, view), false);
      assert.equal(drag.moved(anchor, { x: pointer.x + 6, y: pointer.y }, view), true);
      const twice = { width: view.width * 2, height: view.height * 2 };
      const stable = drag.move(anchor, { x: pointer.x * 2, y: pointer.y * 2 }, twice);
      near(stable.x, from.x);
      near(stable.y, from.y);
      assert.equal(stable.z, depth);
    }
  }
}

// CSS-pixel input and actual canvas dimensions may differ (zoom, layout scale).
const transformed = drag.point({ clientX: 410, clientY: 260 }, { left: 90, top: 60, width: 640, height: 400 }, { width: 1280, height: 800 });
assert.deepEqual(transformed, { x: 640, y: 400 });
const source = { x: .5, y: .5, z: -.4 };
assert.deepEqual(drag.position(source, -1e6, 1e6, { width: 1280, height: 800 }), { x: .08, y: .82, z: -.4 });
assert.deepEqual(drag.position(source, 1e6, -1e6, { width: 1280, height: 800 }), { x: .96, y: .22, z: -.4 });
assert.deepEqual(drag.position(source, 1e6, -1e6, { width: 1280, height: 800 }, { bounds: { minX: .2, maxX: .8, minY: .3, maxY: .7 } }), { x: .8, y: .3, z: -.4 });

// A flower which was already partly behind a margin does not snap when grabbed.
const edge = { x: .95, y: .24, z: .43 };
const tight = { bounds: { minX: .15, maxX: .88, minY: .3, maxY: .75 } };
assert.deepEqual(drag.position(edge, 0, 0, { width: 1280, height: 800 }, tight), edge);
assert.deepEqual(drag.position(edge, 1e5, -1e5, { width: 1280, height: 800 }, tight), edge);
assert.deepEqual(drag.position({ x: 8, y: -3, z: 9 }, 0, 0, { width: 1280, height: 800 }), { x: .96, y: .22, z: 9 });

// Match the old compressed narrow-view branch without changing its rendering.
for (const y of [.4, .6, .75]) {
  const result = drag.position({ x: .5, y, z: .2 }, 0, 12, { width: 390, height: 844 }, { mobile: true });
  near(projectY(result.y) - projectY(y), 12 / 844);
}
const inverted = drag.position(source, 60, 30, { width: 1280, height: 800 }, { bounds: { minX: .9, maxX: .1, minY: .8, maxY: .3 } });
assert(Object.values(inverted).every(Number.isFinite), "impossible crown bounds remain finite");
assert.equal(drag.point({ clientX: 1, clientY: 2 }, { left: 0, top: 0, width: 0, height: 20 }, { width: 1280, height: 800 }), null);
assert.equal(drag.start(source, { x: 1, y: 2 }, { width: 0, height: 0 }), null);
assert.equal(drag.position(source, NaN, 0, { width: 1280, height: 800 }), null);
assert.equal(drag.move(null, { x: 1, y: 2 }, { width: 1280, height: 800 }), null);
assert.equal(drag.moved(null, { x: 1, y: 2 }, { width: 1280, height: 800 }), false);
console.log(`Passed ${combinations} off-center/depth/viewport combinations, pointer intent, canvas scaling, resize anchors, bounds and immutable records.`);
