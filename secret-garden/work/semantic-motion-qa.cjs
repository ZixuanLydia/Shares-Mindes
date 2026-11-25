const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync('work/connection-motion.js', 'utf8'), sandbox);
const motion = sandbox.window.GardenConnectionMotion;
const forms = ['cup', 'flared', 'tall'];
const dims = [[1024,768],[1280,800],[1440,900],[1920,1080],[1920,700]];
const crown = pose => pose.size * 5.8 / pose.camera.distance * ({cup:1.16,flared:1.33,tall:.99}[pose.entry.record.appearance.form]);
const flower = (id, form, z) => ({ record: {id, appearance:{form,openness:.4},position:{z}} });
let checks = 0;
for (const [width,height] of dims) for (const form of forms) for (const z of [-1,0,1]) for (const hubForm of forms) {
  const scene = {width,height,mobile:false,planted:()=>({x:100,y:100,size:30,yaw:.1,pitch:.1})};
  const entry = flower('satellite',form,z);
  const before = JSON.stringify(entry);
  const hub = motion.clusterPose(flower('hub',hubForm,0),scene);
  for (let slot=0;slot<4;slot++) {
    let previous = Infinity;
    for (const strength of [0,.25,.5,.75,1]) {
      const pose = motion.clusterPose(entry,scene,slot,strength);
      const distance = Math.hypot(pose.x-hub.x,pose.y-hub.y);
      assert(distance <= previous + 1e-8, 'stronger relationships cannot be farther away');
      assert(distance - crown(hub) - crown(pose) >= 14-1e-8, 'crowns should not accidentally overlap');
      assert.equal(pose.connectionStrength,strength);
      assert(pose.opacity>=0 && pose.opacity<=1);
      const garden = motion.gardenPose(entry,scene);
      const initial = motion.capture(garden,scene);
      const start = motion.place(initial,pose,0,0,scene);
      const finish = motion.place(initial,pose,1,0,scene);
      assert.equal(start.x,garden.x);
      assert.equal(finish.x,pose.x);
      assert.equal(finish.y,pose.y);
      assert.equal(finish.connectionStrength,pose.connectionStrength);
      previous = distance;
      checks++;
    }
  }
  assert.equal(JSON.stringify(entry),before,'presentation must not modify saved record');
}
const scene = {width:1440,height:900,mobile:false,planted:()=>({yaw:0})};
const hub = motion.clusterPose(flower('hub','cup',0),scene);
const poses = [hub,...Array.from({length:4},(_,i)=>motion.clusterPose(flower('f'+i,'flared',0),scene,i,.5+i*.15))];
let arcs=0,paths=0;
const ctx = {
 save(){},restore(){},beginPath(){},fill(){},stroke(){},
 moveTo(...args){assert(args.every(Number.isFinite));},
 quadraticCurveTo(...args){assert(args.every(Number.isFinite));paths++;},
 arc(...args){assert(args.every(Number.isFinite));assert(args[2]>0);arcs++;}
};
motion.paintConnections(ctx,poses,'hub',13.4);
assert.equal(paths,4);
assert.equal(arcs,24,'at most 12 two-layer pollen motes');
arcs=paths=0;
motion.paintConnections(ctx,poses,'hub',13.4,true);
assert.equal(paths,4);
assert.equal(arcs,16,'reduced motion uses only stationary motes');
console.log(`Passed ${checks} geometry/continuity combinations, immutable records, bounded pollen and reduced motion.`);
