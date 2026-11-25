const assert = require('node:assert/strict');

global.window = {};
require('./body-hand.js');
const openness = window.GardenHandShape.openness;

function hand(curl) {
  const points = Array.from({length:21}, () => ({x:0, y:0, z:0}));
  points[0] = {x:0, y:.08, z:0};
  // Thumb placement does not determine how open the four long fingers are.
  for (let index = 1; index <= 4; index++) points[index] = {x:-.055-index*.015, y:.05-index*.02, z:0};
  for (const [finger, base] of [5,9,13,17].entries()) {
    const x = (finger - 1.5) * .035;
    const lengths = [.048, .033, .025];
    points[base] = {x, y:0, z:0};
    let angle = 0;
    for (let segment = 0; segment < 3; segment++) {
      angle += [35, 145, 55][segment] * Math.PI / 180 * curl;
      const previous = points[base+segment];
      points[base+segment+1] = {
        x, y:previous.y-lengths[segment]*Math.cos(angle),
        z:previous.z+lengths[segment]*Math.sin(angle)
      };
    }
  }
  return points;
}

function transform(points, scale, rotation) {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return points.map(point => ({
    x: .6 + scale*(point.x*cosine-point.z*sine),
    y: .4 + scale*(point.x*sine*.6+point.y*.8+point.z*cosine*.6),
    z: .3 + scale*(-point.x*sine*.8+point.y*.6-point.z*cosine*.8)
  }));
}

assert.equal(openness(hand(0)), 1);
assert.equal(openness(hand(1)), 0);
const amounts = [];
for (let index = 0; index <= 100; index++) {
  const points = hand(index/100);
  const amount = openness(points);
  amounts.push(amount);
  assert(amount >= 0 && amount <= 1);
  if (index) {
    assert(amount <= amounts[index-1]+1e-10, 'closing must continuously decrease openness');
    assert(amounts[index-1]-amount < .04, 'small finger changes must not cause a discrete jump');
  }
  for (const scale of [.1, .8, 3]) {
    assert(Math.abs(openness(transform(points,scale,.9))-amount)<1e-10,
      'hand translation, rotation and uniform size must not affect openness');
  }
}
assert(amounts[50] > .2 && amounts[50] < .8);
const thumbFolded = hand(0);
for (let index = 1; index <= 4; index++) thumbFolded[index] = {...thumbFolded[0]};
assert.equal(openness(thumbFolded), 1);
const oneFolded = hand(0);
const folded = hand(1);
for (let index = 5; index <= 8; index++) oneFolded[index] = folded[index];
assert(openness(oneFolded) > .7 && openness(oneFolded) < 1);
assert.equal(openness(null), null);
assert.equal(openness(hand(0).slice(0,20)), null);
const sparse = hand(0);
delete sparse[1];
assert.equal(openness(sparse), null);
const missing = hand(0);
delete missing[8].z;
assert.equal(openness(missing), null);
const nonfinite = hand(0);
nonfinite[12].x = NaN;
assert.equal(openness(nonfinite), null);
assert.equal(openness(Array.from({length:21},()=>({x:0,y:0,z:0}))),null);
const collapsed = hand(0);
collapsed[6] = {...collapsed[5]};
assert.equal(openness(collapsed), null);
console.log('Open palm, fist, continuous curl, rigid transforms, thumb independence and invalid/partial landmark checks passed.');
