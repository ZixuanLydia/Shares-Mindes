const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const plain = value => JSON.parse(JSON.stringify(value));
const dataSource = fs.readFileSync(__dirname + '/garden-data.js', 'utf8');
const sharedSource = fs.readFileSync(__dirname + '/shared-garden.js', 'utf8');
const draft = {thought:'A remembered family meal',associations:['Memory'],form:'cup',color:'peach',openness:.2,size:.39,position:{x:.82,y:.61,z:.43}};
const p1 = {x:.3,y:.45,z:.43}, p2 = {x:.62,y:.7,z:.43};

function client(storage = new Map(), backend = null) {
  let serial = 0, timer = 0, online = true;
  const window = {
    location:{protocol:backend?'http:':'file:'},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    crypto:{randomUUID:()=>Date.now()+'-'+Math.random()+'-'+ ++serial},addEventListener(){}
  };
  const context = vm.createContext({window,document:{hidden:false},console,Date,Promise,AbortController,
    fetch:(...args)=>online?backend.fetch(...args):Promise.reject(Error('Offline')),
    setTimeout:()=>++timer,clearTimeout(){}});
  vm.runInContext((backend?sharedSource+'\n':'')+dataSource,context);
  return {data:window.GardenData,window,storage,setOnline:value=>{online=value;}};
}

function fakeServer() {
  const flowers = new Map(), sessions = new Map();
  let revision = 0, serial = 0, held = null;
  const reply=(status,value)=>({status,ok:status>=200&&status<300,json:async()=>plain(value)});
  return {
    flowers,
    holdNextPosition() {
      let begin, release;
      const started = new Promise(resolve=>{begin=resolve;});
      const wait = new Promise(resolve=>{release=resolve;});
      held={begin,wait};
      return {started,release};
    },
    async fetch(path,options={}) {
      const body=options.body?JSON.parse(options.body):{};
      const token=options.headers?.Authorization?.replace('Bearer ','');
      let author=sessions.get(token);
      if(path==='/api/session') {
        if(token&&!author)return reply(401,{error:'Invalid session'});
        const next=token||'token-'+ ++serial;
        author=author||{id:'author-'+serial,name:'Local gardener'};
        if(body.nickname)author.name=body.nickname;
        sessions.set(next,author);return reply(200,{token:next,author,revision});
      }
      if(path==='/api/garden') {
        if(options.headers?.['If-None-Match']==='"garden-'+revision+'"')return reply(304,{});
        return reply(200,{revision,flowers:[...flowers.values()]});
      }
      if(!author)return reply(401,{error:'Invalid session'});
      if(path==='/api/flowers') {
        if(!flowers.has(body.id)){body.author.id=author.id;flowers.set(body.id,body);revision++;}
        return reply(200,{flower:flowers.get(body.id),revision});
      }
      const id=decodeURIComponent(path.split('/')[3]),record=flowers.get(id);
      if(!record||record.author.id!==author.id)return reply(403,{error:'Another owner'});
      if(path.endsWith('/position')) {
        if(held){const gate=held;held=null;gate.begin();await gate.wait;}
        record.position=plain(body.position);
      } else {
        record.appearance.openness=Math.max(record.appearance.openness,body.openness);
        const growth=new Map(record.growth.map(p=>[p.id,p]));
        for(const p of body.growth||[])growth.set(p.id,p);
        record.growth=[...growth.values()];
      }
      revision++;return reply(200,{flower:record,revision});
    }
  };
}

(async()=>{
  const storage=new Map(), a=client(storage);
  const flower=a.data.createFlower(draft);assert(a.data.save([flower]));
  const stale=client(storage), old=plain(stale.data.load()[0]);
  const before=plain(a.data.load()[0]);
  const moved=a.data.savePosition(flower.id,p1);
  assert(moved.saved);assert.deepEqual(plain(moved.record.position),p1);
  const withoutPosition=record=>{record=plain(record);delete record.position;return record;};
  assert.deepEqual(withoutPosition(moved.record),withoutPosition(before),'A move changes no thought, growth, appearance, author or date');
  assert.deepEqual(plain(client(storage).data.load()[0].position),p1,'Reload restores position');
  stale.data.save([old]);assert.deepEqual(plain(client(storage).data.load()[0].position),p1,'Stale generic save cannot undo a move');
  stale.data.saveBloom(flower.id,.8);assert.deepEqual(plain(client(storage).data.load()[0].position),p1,'Growth cannot undo a move');
  for(const bad of [{...p1,x:NaN},{...p1,x:.01},{...p1,y:1},{...p1,z:17},{...p1,x:true}])assert.equal(a.data.savePosition(flower.id,bad),null);
  moved.record.position.x=.9;assert.equal(a.data.load()[0].position.x,p1.x,'Results are cloned');
  const legacy=a.data.createFlower({...draft,position:{...draft.position,z:2}});a.data.save([legacy]);
  assert.equal(a.data.savePosition(legacy.id,{...p2,z:2}).record.position.z,2,'A move preserves valid legacy depth outside the projected range');
  assert.equal(client(storage).data.load().find(record=>record.id===legacy.id).position.z,2);

  const backend=fakeServer(), first=client(new Map(),backend), other=client(new Map(),backend);
  await first.data.ready;await other.data.ready;
  first.data.setNickname('Alice');const shared=first.data.createFlower(draft);first.data.save([shared]);await first.data.flush();await other.data.flush();
  assert.equal(other.data.savePosition(shared.id,p2),null,'Other authors cannot move the original');
  first.setOnline(false);first.data.savePosition(shared.id,p1);first.data.savePosition(shared.id,p2);
  assert.deepEqual(plain(first.data.load()[0].position),p2,'Latest queued move is visible');
  await first.data.flush();assert.equal(first.data.status.phase,'offline');
  const restored=client(first.storage,backend);await restored.data.ready;
  assert.deepEqual(plain(restored.data.load()[0].position),p2,'Pending moves survive refresh');
  await restored.data.flush();await other.data.flush();
  assert.deepEqual(plain(other.data.load()[0].position),p2,'Remote user sees queued moves in order');
  const gate=backend.holdNextPosition();const observed=[];
  restored.data.subscribe(state=>{if(state.flowers?.[0])observed.push(plain(state.flowers[0].position));});
  restored.data.savePosition(shared.id,p1);const pending=restored.data.flush();await gate.started;
  restored.data.savePosition(shared.id,p2);const at=observed.length;gate.release();await pending;
  assert(observed.slice(at).every(position=>position.x===p2.x&&position.y===p2.y),'An earlier acknowledgement cannot flash back over the latest move');
  assert.deepEqual(plain(backend.flowers.get(shared.id).position),p2);
  restored.data.saveBloom(shared.id,.9);await restored.data.flush();
  assert.deepEqual(plain(backend.flowers.get(shared.id).position),p2,'Shared growth changes no position');
  assert.equal(restored.data.status.pending,0);
  console.log('PASS: local position persistence, immutable metadata, stale-tab growth safety, ownership, offline/reload order, in-flight acknowledgement isolation and remote position sync.');
})().catch(error=>{console.error(error);process.exitCode=1;});
