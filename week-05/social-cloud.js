import {firebaseConfig} from './firebase-config.js';
import {normalizeStory} from './story.js';
export const validShareId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(id);
const base = new URL(firebaseConfig.databaseURL);
if (base.protocol !== 'https:' || !/^[a-z0-9.-]+\.(firebaseio\.com|firebasedatabase\.app)$/.test(base.hostname)) throw Error('Invalid Firebase database URL.');
let connection;
async function request(path, method = 'GET', body, user, query = {}) {
  const url = new URL(`${path}.json`, base);
  for (const [key,value] of Object.entries(query)) url.searchParams.set(key, JSON.stringify(value));
  if (user) url.searchParams.set('auth', await user.getIdToken());
  const response = await fetch(url, {method, cache:'no-store', signal:AbortSignal.timeout(15000), headers:{'Content-Type':'application/json'}, body:body === undefined ? undefined : JSON.stringify(body)});
  if (!response.ok) throw Error([401,403].includes(response.status) ? 'Access denied. Week 5 database rules may not be installed yet; your local draft is safe.' : 'Connection failed. Please try again.');
  return response.json();
}
export function readRecord(record) {
  if (!record || record.version !== 2 || typeof record.payload !== 'string') throw Error('Story unavailable. Its author may have removed it.');
  return normalizeStory(JSON.parse(record.payload));
}
export function serialize(story, limit = 3000000) {
  normalizeStory(story); const result = JSON.stringify(story);
  if (new TextEncoder().encode(result).length > limit) throw Error('This copy is too large. Public stories allow 500 KB; private copies allow 3 MB. Try fewer uploaded images, or use the starter pieces.');
  return result;
}
export async function loadSharedStory(id) {
  if (!validShareId(id)) throw Error('Invalid story link.');
  return readRecord(await request(`social05/stories/${id}`));
}
export async function listStories() {
  const records = await request('social05/stories', 'GET', undefined, undefined, {orderBy:'updatedAt',limitToLast:20});
  return Object.entries(records || {}).flatMap(([id, record]) => {
    try { return [{id, story:readRecord(record), updatedAt:record.updatedAt}]; } catch { return []; }
  }).sort((a,b) => b.updatedAt-a.updatedAt);
}
export async function listReplies(id) {
  if (!validShareId(id)) throw Error('Invalid story link.');
  const records = await request(`social05/replies/${id}`, 'GET', undefined, undefined, {orderBy:'updatedAt',limitToLast:20});
  return Object.entries(records || {}).map(([id,record]) => ({id,...record})).sort((a,b) => a.updatedAt-b.updatedAt);
}
export function connectCloud() {
  if (!connection) connection = initialize().catch(error => { connection = null; throw error; });
  return connection;
}
async function initialize() {
  const [{initializeApp,getApps}, {getAuth,setPersistence,browserLocalPersistence,signInAnonymously}] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')
  ]);
  const auth = getAuth(getApps()[0] || initializeApp(firebaseConfig));
  await setPersistence(auth,browserLocalPersistence); await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  const user = auth.currentUser, uid = user.uid;
  const send = (path,method,body) => request(path,method,body,user);
  return {
    uid,
    async save(story) { await send(`users/${uid}/week05`,'PUT',{version:2,payload:serialize(story),updatedAt:{'.sv':'timestamp'}}); },
    async load() { const record = await send(`users/${uid}/week05`); return record ? readRecord(record) : null; },
    async publish(story) {
      if (!story.author.trim()) throw Error('Add your nickname before publishing.');
      await send(`social05/stories/${uid}`,'PUT',{version:2,payload:serialize(story,500000),updatedAt:{'.sv':'timestamp'}}); return uid;
    },
    async sharedId() { return await send(`social05/stories/${uid}`) ? uid : null; },
    async unpublish() { await send(`social05/stories/${uid}`,'DELETE'); },
    async reply(id,nickname,text) {
      if (!validShareId(id) || !nickname.trim() || nickname.length > 60 || !text.trim() || text.length > 500) throw Error('Add a nickname and a reply of 1–500 characters.');
      await send(`social05/replies/${id}/${uid}`,'PUT',{nickname:nickname.trim(),text:text.trim(),updatedAt:{'.sv':'timestamp'}});
    },
    async removeReply(id) { if (!validShareId(id)) throw Error('Invalid story.'); await send(`social05/replies/${id}/${uid}`,'DELETE'); }
  };
}
