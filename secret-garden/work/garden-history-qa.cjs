const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync(__dirname + "/garden-data.js", "utf8");
const key = "secret-garden:v1";
let now = Date.parse("2026-11-17T15:00:00.000Z");
let serial = 0;
const plain = value => JSON.parse(JSON.stringify(value));
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const iso = offset => new Date(now + offset).toISOString();
const makeStore = initial => ({
  value: initial ? JSON.stringify(initial) : null,
  writes: 0,
  blocked: false,
  getItem(name) { assert.equal(name, key); return this.value; },
  setItem(name, value) {
    assert.equal(name, key);
    if (this.blocked) throw Error("Storage blocked");
    this.value = value;
    this.writes += 1;
  },
});
const open = storage => {
  const context = { window: { localStorage: storage, crypto: { randomUUID: () => "point-" + ++serial } }, Date: Clock };
  vm.runInNewContext(source, context);
  return context.window.GardenData;
};
const draft = { thought: "A quiet morning", associations: ["Stillness"], form: "cup", color: "peach",
  size: .46, openness: .25, position: {x:.72,y:.6,z:.28} };
const oldFlower = {
  id: "legacy-flower",
  author: {id:"old-author",name:"Local gardener"},
  thought: draft.thought,
  associations: draft.associations,
  appearance: {form:draft.form,color:draft.color,size:draft.size,openness:draft.openness},
  position: draft.position,
  createdAt: "2026-11-11T05:30:00.000Z",
};
const legacyStore = makeStore({version:1,author:oldFlower.author,flowers:[oldFlower]});
const legacy = open(legacyStore);
const baseline = plain(legacy.load()[0]);
assert.deepEqual(baseline.growth, [{id:"snapshot:legacy-flower",at:null,openness:.25,source:"snapshot"}]);
assert.equal(legacyStore.writes,0);
assert.deepEqual(plain(legacy.growthFor(oldFlower)),baseline.growth);
assert.equal(legacyStore.writes,0);
baseline.growth[0].openness = .99;
baseline.author.name = "Changed outside";
baseline.position.x = .99;
baseline.appearance.openness = .99;
baseline.associations[0] = "Changed outside";
assert.equal(legacy.load()[0].growth[0].openness,.25);
assert.equal(legacy.load()[0].author.name,"Local gardener");
assert.equal(legacy.load()[0].position.x,oldFlower.position.x);
assert.equal(legacy.load()[0].appearance.openness,.25);
assert.equal(legacy.load()[0].associations[0],"Stillness");

let result = plain(legacy.saveBloom(oldFlower.id,.25));
assert.equal(result.saved,true);
assert.equal(legacyStore.writes,0);
assert.equal(result.record.growth.length,1);
assert.equal(legacy.saveBloom(oldFlower.id,NaN),null);
assert.equal(legacy.saveBloom("missing",.8),null);
assert.equal(legacyStore.writes,0);

const firstPress = legacy.growthPoint(.25,"mouse",iso(-400));
const middle = legacy.growthPoint(.4,"mouse",iso(-100));
result = plain(legacy.saveBloom(oldFlower.id,.55,{source:"mouse",growth:[firstPress,middle]}));
assert.equal(result.saved,true);
assert.equal(result.openness,.55);
assert.equal(result.record.growth.length,4);
assert.deepEqual(result.record.growth[0],{id:"snapshot:legacy-flower",at:null,openness:.25,source:"snapshot"});
assert.equal(result.record.growth.at(-1).source,"mouse");
assert.equal(result.record.growth.at(-1).openness,.55);
assert.equal(result.record.growth.at(-1).at,iso(0));
assert.equal(result.record.author.name,"Local gardener");
assert.deepEqual(result.record.position,oldFlower.position);
const writesAfterGrowth = legacyStore.writes;
const copy = plain(result.record);
legacy.saveBloom(oldFlower.id,.45,{source:"mouse",growth:[legacy.growthPoint(.45,"mouse")]});
legacy.saveBloom(oldFlower.id,.55);
assert.equal(legacyStore.writes,writesAfterGrowth);
assert.deepEqual(plain(legacy.load()[0]),copy);

const stale = open(legacyStore);
const staleRecord = plain(stale.load()[0]);
now += 1000;
const finalSample = legacy.growthPoint(.7,"body",iso(0));
result = plain(legacy.saveBloom(oldFlower.id,.7,{source:"body",growth:[finalSample]}));
assert.equal(result.record.growth.at(-1).id,finalSample.id);
assert.equal(result.record.growth.filter(event=>event.openness===.7).length,1);
const afterBodyWrites = legacyStore.writes;
result = plain(stale.saveBloom(oldFlower.id,.6,{growth:[stale.growthPoint(.6,"mouse")]}));
assert.equal(result.openness,.7);
assert.equal(result.record.growth.at(-1).source,"body");
assert.equal(legacyStore.writes,afterBodyWrites);

now += 1000;
result = plain(stale.saveBloom(oldFlower.id,.9,{source:"keyboard"}));
const ids = result.record.growth.map(event=>event.id);
assert.equal(new Set(ids).size,ids.length);
assert.equal(result.record.growth.at(-1).source,"keyboard");
assert.equal(result.record.growth.at(-1).openness,.9);
assert.equal(result.record.growth[0].openness,.25);
legacy.save([staleRecord]);
assert.equal(legacy.load()[0].appearance.openness,.9);
assert.deepEqual(plain(legacy.load()[0].growth),result.record.growth);

const damaged = {...oldFlower,growth:[
  null, {id:"bad-time",at:"yesterday",openness:.3,source:"mouse"},
  {id:"bad-open",at:iso(-1000),openness:5,source:"mouse"},
  {id:"bad-null",at:null,openness:.3,source:"keyboard"},
  {id:"valid",at:iso(-400),openness:.25,source:"planted"},
  {id:"valid",at:iso(-200),openness:.9,source:"mouse"},
]};
const damagedStore = makeStore({version:1,author:oldFlower.author,flowers:[damaged]});
const repaired = open(damagedStore);
assert.equal(repaired.load().length,1);
assert.equal(repaired.load()[0].growth.length,1);
assert.equal(repaired.load()[0].growth[0].openness,.25);
assert.equal(damagedStore.writes,0);

const draftStore = makeStore();
const current = open(draftStore);
assert(current.setNickname("小花"));
const seed = current.growthPoint(.35,"seed",iso(-2000));
const outward = current.growthPoint(.8,"mouse",iso(-1500));
const inward = current.growthPoint(.4,"mouse",iso(-1000));
const fresh = plain(current.createFlower({...draft,openness:.4,growth:[seed,outward,inward]}));
assert.deepEqual(fresh.growth.map(point=>point.openness),[.35,.8,.4,.4]);
assert.deepEqual(fresh.growth.map(point=>point.source),["seed","mouse","mouse","planted"]);
assert.equal(fresh.growth.at(-1).at,fresh.createdAt);
assert.equal(fresh.author.name,"小花");
assert(current.save([fresh]));
assert.deepEqual(plain(open(draftStore).load()),[fresh]);
const withoutDraft = plain(current.createFlower(draft));
assert.deepEqual(withoutDraft.growth.map(event=>[event.source,event.at,event.openness]),[["planted",withoutDraft.createdAt,.25]]);
assert.equal(current.growthPoint(.4,"unknown"),null);
assert.equal(current.growthPoint(1.1,"mouse"),null);
assert.equal(current.growthPoint(.4,"mouse","2026"),null);
assert.equal(current.growthPoint(.4,"body",null),null);
assert.equal(current.growthPoint(.4,"seed",null),null);
assert.equal(current.growthPoint(.4,"snapshot",null).at,null);

draftStore.blocked = true;
now += 1000;
result = plain(current.saveBloom(fresh.id,.6,{source:"mouse"}));
assert.equal(result.saved,false);
assert.equal(result.record.growth.at(-1).openness,.6);
const writesBeforeRetry = draftStore.writes;
result = plain(current.saveBloom(fresh.id,.6));
assert.equal(result.saved,false);
assert.equal(draftStore.writes,writesBeforeRetry);
draftStore.blocked = false;
assert(current.save([]));
assert.equal(open(draftStore).load()[0].appearance.openness,.6);

const unknownChange = {...oldFlower,appearance:{...oldFlower.appearance,openness:.75},growth:[{
  id:"imported",at:oldFlower.createdAt,openness:.25,source:"planted",
}]};
const display = plain(current.growthFor(unknownChange));
assert.equal(display.at(-1).openness,.75);
assert.equal(display.at(-1).source,"snapshot");
assert.equal(display.at(-1).at,null);
assert.equal(unknownChange.growth.length,1);

console.log("Validated read-only legacy baselines, real recorded growth, non-monotonic drafts, merged histories, no-op writes, deep clones, nickname snapshots, and storage recovery.");
