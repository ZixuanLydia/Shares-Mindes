const assert = require('node:assert/strict');
global.window = { GardenConnectionMotion: { paintGlow() {} } };
require('./body-motion.js');

const target = Object.freeze({ id:'flower', x:600, y:450, size:110, crownX:600, crownY:400 });
const neighbor = Object.freeze({ id:'neighbor', x:800, y:450, size:100, crownX:800, crownY:400 });
const step = 1000/60;
const motion = window.GardenBodyMotion.create();
let now = 0;
let sample = null;

function hold(openness, frames=45, x=.6, y=.4) {
  for (let tick=0; tick<frames; tick++) {
    if (tick%5===0) sample={x,y,openness,at:now};
    motion.update([target,neighbor],sample,1000,1000,now,step,false);
    now+=step;
  }
}
hold(1);
assert.equal(motion.primaryId,'flower');
assert(motion.effect('flower').openness>.99 && motion.effect('flower').control>.99);
hold(0,45,.15,.15);
assert.equal(motion.primaryId,'flower','fist still controls the flower after drawing back');
assert(motion.effect('flower').openness<.01);
hold(.5);
assert(Math.abs(motion.effect('flower').openness-.5)<.01);
hold(1);
assert(motion.effect('flower').openness>.99,'open after a fist works repeatedly');
const before = motion.effect('flower').openness;
for (let tick=0;tick<8;tick++) {
  motion.update([target,neighbor],sample,1000,1000,now,step,false);
  now+=step;
}
assert(Math.abs(motion.effect('flower').openness-before)<.01,'brief dropped samples preserve posture');
hold(1,45,.8,.4);
assert.equal(motion.primaryId,'neighbor','open palm can choose another flower');
hold(0,45,.02,.02);
assert.equal(motion.primaryId,'neighbor','fist keeps the chosen flower');
assert(motion.effect('neighbor').openness<.01);
for(let tick=0;tick<160;tick++) {
  motion.update([target,neighbor],null,1000,1000,now,step,false);
  now+=step;
}
assert.equal(motion.primaryId,null);
assert(!motion.position,'loss fades the hand after a bounded interval');
assert(motion.effect('neighbor') === undefined || motion.effect('neighbor').control<.01);
assert(motion.effect('neighbor') === undefined || motion.effect('neighbor').handBloom===null);

const auto=window.GardenBodyMotion.create();
auto.update([target,neighbor],{x:.01,y:.01,openness:1,at:0},1000,1000,0,step,false);
assert.equal(auto.primaryId,'flower','default main flower works without precise pointing');

function lowRateMovement() {
  const move=window.GardenBodyMotion.create();
  let sample=null;
  let previous=null;
  let largestBackstep=0;
  let most=0;
  for (let tick=0;tick<120;tick++) {
    const now=tick*step;
    if(tick%10===0) sample={x:.38+now/1000*.1,y:.4,openness:.7,at:now};
    move.update([target],sample,1000,1000,now,step,false);
    const pos=move.position;
    if(previous!==null) largestBackstep=Math.max(largestBackstep,previous-pos.x);
    previous=pos.x;
    most=Math.max(most,Math.abs(pos.x-sample.x));
  }
  assert(largestBackstep<.0005,'monotonic movement must not visibly drift backward');
  assert(most<.03,'prediction remains bounded');
  return {largestBackstep,largestPrediction:most};
}
console.log('Continuity checks',lowRateMovement());
console.log('Open, partial, fist, repeated reversal, pullback lock, default target, brief loss and smooth release passed.');
