import assert from 'node:assert/strict';
import {loadSharedStory, validShareId} from './cloud.js';
import {newStory} from './story.js';
const id = '42e9b274-d43b-4cb3-a5b9-4604b261e519';
assert.equal(validShareId(id),true);
for (const bad of [null,'../users/a','', 'a.json?auth=secret']) assert.equal(validShareId(bad),false);
const originalFetch = globalThis.fetch;
let calls = 0;
try {
  const story = newStory(); story.title = '<script>not executable</script>';
  globalThis.fetch = async (url,options) => {
    calls++;
    assert.equal(url.pathname,`/shares/${id}.json`);
    assert.equal(url.search,'');
    assert.equal(options.body,undefined);
    return {ok:true,json:async()=>({version:2,enabled:true,payload:JSON.stringify(story)})};
  };
  assert.equal((await loadSharedStory(id)).title,story.title);
  await assert.rejects(()=>loadSharedStory('../users/x'),/invalid/);
  assert.equal(calls,1);
  globalThis.fetch = async()=>({ok:false,status:401});
  await assert.rejects(()=>loadSharedStory(id),/unavailable/);
  globalThis.fetch = async()=>({ok:true,json:async()=>({enabled:false})});
  await assert.rejects(()=>loadSharedStory(id),/no longer shared/);
} finally { globalThis.fetch = originalFetch; }
console.log('PASS: public share loader validates IDs, performs only an unauthenticated read, and rejects denied/revoked links.');
