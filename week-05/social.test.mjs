import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {demoStories,filterStories} from './social-demo.js';
import {serialize,readRecord,validShareId,listStories,listReplies,loadSharedStory} from './social-cloud.js';
test('24 explicitly simulated people; safe story data and search',()=>{
  assert.equal(demoStories.length,24);
  for(const entry of demoStories){assert.match(entry.story.author,/demo/);assert.equal(readRecord({version:2,payload:serialize(entry.story)}).scenes.length,3);}
  assert.equal(filterStories(demoStories,'ARI (DEMO)').length,1);
  assert.equal(filterStories(demoStories,'nonexistent').length,0);
});
test('reject invalid paths and oversized public story',()=>{
  assert.equal(validShareId('../users'),false);assert.equal(validShareId('user_1'),true);
  assert.throws(()=>serialize(demoStories[0].story,10));assert.throws(()=>readRecord(null));
});
test('all seven catalog stickers survive JSON save/load',()=>{
  const assets=JSON.parse(fs.readFileSync(new URL('./assets.json',import.meta.url)));
  assert.equal(assets.length,7);
  for(const asset of assets){
    assert.ok(fs.existsSync(new URL(asset.src,import.meta.url)));
    const story=structuredClone(demoStories[0].story);
    story.scenes[0].items[0].src=asset.src;
    assert.equal(readRecord({version:2,payload:serialize(story)}).scenes[0].items[0].src,asset.src);
  }
});
test('public reads are bounded and do not attach credentials',async()=>{
  const original=globalThis.fetch;const calls=[];
  globalThis.fetch=async url=>{calls.push(new URL(url));return {ok:true,json:async()=>({})};};
  try {await listStories();await listReplies('user_1');await assert.rejects(loadSharedStory('../users'));assert.equal(calls.length,2);
  for(const url of calls){assert.equal(url.searchParams.get('limitToLast'),'20');assert.equal(url.searchParams.get('orderBy'),'"updatedAt"');assert.equal(url.searchParams.has('auth'),false);}}
  finally{globalThis.fetch=original;}
});
test('Week 4 rule subtrees retained exactly; no root access opened',()=>{
  const old=JSON.parse(fs.readFileSync(new URL('../week-04/database.rules.json',import.meta.url))).rules;
  const next=JSON.parse(fs.readFileSync(new URL('./database.rules.json',import.meta.url))).rules;
  assert.deepEqual(next.shares,old.shares);assert.deepEqual(next.users.$uid.week04,old.users.$uid.week04);assert.deepEqual(next.users.$uid.shareId,old.users.$uid.shareId);
  assert.equal(next['.read'],false);assert.equal(next['.write'],false);
  assert.match(next.social05.stories.$uid['.write'],/auth.uid === \$uid/);
  assert.match(next.social05.replies.$story.$uid['.write'],/auth.uid === \$uid/);
});
