const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

class Element {
  constructor(id='') { this.id=id; this.children=[]; this.listeners={}; this.attributes=new Map(); this.dataset={}; this.style={}; this.hidden=false; this.disabled=false; this.textContent=''; }
  addEventListener(type,fn) { (this.listeners[type]??=[]).push(fn); }
  async emit(type,event={}) { for (const fn of this.listeners[type]??[]) await fn({target:this,detail:1,...event}); }
  setAttribute(name,value) { this.attributes.set(name,String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  toggleAttribute(name,value) { value ? this.setAttribute(name,'') : this.removeAttribute(name); }
  getAttribute(name) { return this.attributes.get(name)??null; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children=nodes; }
  contains(node) { return this===node || this.children.some(child=>child.contains?.(node)); }
  focus() { this.document.activeElement=this; }
}
function harness({emptyRank=false, entriesCount=2}={}) {
  const elements=new Map();
  const document={activeElement:null,getElementById(id) { if (!elements.has(id)) { const el=new Element(id); el.document=this; elements.set(id,el); } return elements.get(id); },createElement(tag){const el=new Element(tag);el.document=this;return el;}};
  const reading=document.getElementById('reading');
  document.getElementById('focus-view').querySelector=()=>reading;
  document.getElementById('focus-fusion').hidden=true;
  const garden=document.getElementById('garden');
  garden.querySelector=selector=>document.getElementById(selector);
  const pending=[];
  const subscribers=new Set();
  const semantic={
    embed(texts) { return new Promise((resolve,reject)=>pending.push({texts,resolve,reject})); },
    subscribe(fn) { subscribers.add(fn); return ()=>subscribers.delete(fn); }
  };
  const records=Array.from({length:entriesCount},(_,i)=>({id:String(i),thought:'Thought '+i,author:{name:'Gardener'},createdAt:'2026-11-18T06:00:00Z',appearance:{form:'cup',openness:.4},position:{x:.4,y:.5,z:0}}));
  const entries=records.map(record=>({record}));
  const links=(source,records,method)=>emptyRank?[]:records.filter(r=>r.id!==source.id).map(record=>({record,words:['meaning'],strength:.8,method,relation:{summary:'Shared meaning'}}));
  const window={GardenSemantic:semantic,GardenConnections:{rank:(source,records)=>links(source,records,'semantic'),match:(source,records)=>links(source,records,'keywords')},GardenConnectionDrag:{create:()=>({clear(){},bind(){},apply(){},split(){return false;},get fusedId(){return null;}}),radiusOf:()=>10,splitDuration:410},GardenReplay:{setup:()=>({close(){},open(){},arrive(){},update(){return .4;},get openness(){return .4;}})}};
  const context={window,document,console:{warn(){}},Intl,performance:{now:()=>0}};
  vm.runInNewContext(fs.readFileSync('work/connection-motion.js','utf8'),context);
  vm.runInNewContext(fs.readFileSync('work/focus.js','utf8'),context);
  let restored=0;
  const api=window.GardenFocus.setup({garden,reducedMotion:{matches:true},onRestore:()=>restored++,listEntries:()=>entries});
  const scene={width:1280,height:800,mobile:false,planted:()=>({x:400,y:400,size:80,yaw:0,pitch:0}),demo:{x:400,y:400,size:80}};
  function enter(index=0) { const entry=entries[index];api.enter({id:entry.record.id,entry,openness:.4,yaw:0,pitch:0});api.update(0);api.placeConnections(scene); }
  function resolve(index) { const req=pending[index];req.resolve(req.texts.map((_,i)=>[1,i*.2,.4])); }
  const el=id=>document.getElementById(id);
  return {api,scene,entries,pending,subscribers,el,enter,resolve,get restored(){return restored;}};
}
(async()=>{
  const h=harness();
  h.enter();
  const initial=h.el('focus-connections').emit('click');
  assert.equal(h.pending.length,1);
  assert.equal(h.el('focus-connections').disabled,true);
  await h.el('focus-connections').emit('click');
  assert.equal(h.pending.length,1,'duplicate search must not start another request');
  assert.equal(h.api.leave(),true);
  assert.equal(h.api.active,false);
  assert.equal(h.el('focus-view').hidden,true);
  assert.equal(h.restored,1);
  h.enter(1);
  const replacement=h.el('focus-connections').emit('click');
  assert.equal(h.pending.length,2);
  h.resolve(0);await initial;
  assert.equal(h.el('focus-related').hidden,true,'late search must not gather into new session');
  assert.equal(h.el('focus-connections').disabled,true,'old result must not unlock a newer search');
  h.resolve(1);await replacement;
  assert.equal(h.el('focus-related').hidden,false);
  assert.equal(h.el('focus-connections').textContent,'Hide Connections');
  assert.equal(h.el('focus-connections').disabled,false);
  assert.equal(h.subscribers.size,0);
  h.api.placeConnections(h.scene);
  const target=h.el('focus-related-list').children[0];
  await target.emit('click');
  h.api.placeConnections(h.scene);
  assert.equal(h.api.update(50).id,'0','related row switches current subject');
  assert.equal(h.el('focus-thought').textContent,'Thought 0');
  await h.el('focus-connections').emit('click');
  h.api.placeConnections(h.scene);
  assert.equal(h.el('focus-related').hidden,true);
  assert.equal(h.api.update(100).group,null,'hide returns to single flower');
  await h.el('focus-connections').emit('click');
  assert.equal(h.pending.length,2,'cached embeddings should not be recomputed');
  assert.equal(h.el('focus-related').hidden,false);
  h.api.leave();
  assert.equal(h.api.active,false);

  const f=harness();f.enter();
  const failed=f.el('focus-connections').emit('click');
  f.pending[0].reject(new Error('load failed'));await failed;
  assert.equal(f.el('focus-related').hidden,false,'keyword fallback remains interactive');
  assert.equal(f.api.update(0).connectionMethod,'keywords');
  assert.equal(f.el('focus-connections').disabled,false);
  await f.el('focus-connections').emit('click');f.api.placeConnections(f.scene);
  const retry=f.el('focus-connections').emit('click');
  assert.equal(f.pending.length,2,'a failed model index must remain retryable');
  f.resolve(1);await retry;
  assert.equal(f.api.update(0).connectionMethod,'semantic');
  assert.equal(f.el('focus-connections').disabled,false);

  const n=harness({emptyRank:true});n.enter();
  const noMatch=n.el('focus-connections').emit('click');n.resolve(0);await noMatch;
  assert.equal(n.el('focus-related').hidden,true);
  assert.equal(n.el('focus-connections').textContent,'Find Connections');
  await n.el('focus-connections').emit('click');
  assert.equal(n.pending.length,1,'no-match retry reuses cache');
  assert.equal(n.el('focus-connections').disabled,false);

  const one=harness({entriesCount:1});one.enter();await one.el('focus-connections').emit('click');
  assert.equal(one.pending.length,0);
  assert.match(one.el('focus-connection-status').textContent,/one more thought/);
  console.log('Passed async cancellation, stale result isolation, duplicate guard, switch/hide/reopen, cached reuse, failure fallback/retry, no-match retry, and one-flower guard.');
})().catch(error=>{console.error(error);process.exitCode=1;});
