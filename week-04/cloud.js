import {firebaseConfig} from './firebase-config.js';
import {normalizeStory, MAX_BYTES} from './story.js';
export const validShareId = id => typeof id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id);
function databaseBase() {
  if (!firebaseConfig?.databaseURL) throw Error('Firebase is not configured.');
  const base = new URL(firebaseConfig.databaseURL);
  if (base.protocol !== 'https:' || !/^[a-z0-9.-]+\.(firebaseio\.com|firebasedatabase\.app)$/.test(base.hostname) || base.username || base.password || base.search || base.hash || base.pathname !== '/') throw Error('Use the HTTPS databaseURL supplied by Firebase.');
  return base;
}
function readStory(record) {
  if (!record || record.version !== 2 || typeof record.payload !== 'string' || record.payload.length > MAX_BYTES) throw Error('This is not a valid Week 4 story.');
  return normalizeStory(JSON.parse(record.payload));
}
function serialize(story) {
  normalizeStory(story); const payload = JSON.stringify(story);
  if (new TextEncoder().encode(payload).length > MAX_BYTES) throw Error('Cloud copies are limited to 3 MB. Export a backup, then remove some uploaded images.');
  return payload;
}
// A teacher can read a published snapshot without creating an account or identity.
export async function loadSharedStory(id) {
  if (!validShareId(id)) throw Error('This share link is incomplete or invalid.');
  const response = await fetch(new URL(`shares/${id}.json`, databaseBase()), {cache:'no-store', signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error('This story is unavailable or its sharing has been turned off.');
  const record = await response.json();
  if (!record?.enabled) throw Error('This story is no longer shared.');
  return readStory(record);
}
export async function connectCloud() {
  if (!firebaseConfig) return null;
  const {apiKey, projectId, databaseURL} = firebaseConfig;
  if (!apiKey || !projectId || !databaseURL) throw Error('Firebase configuration needs apiKey, projectId and databaseURL.');
  const base = databaseBase();
  const [{initializeApp}, {getAuth, setPersistence, browserLocalPersistence, signInAnonymously}] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js')
  ]);
  const auth = getAuth(initializeApp(firebaseConfig));
  await setPersistence(auth, browserLocalPersistence); await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  const privatePath = `users/${encodeURIComponent(auth.currentUser.uid)}`;
  async function request(method, body, path = `${privatePath}/week04`) {
    const user = auth.currentUser; if (!user) throw Error('Browser identity is unavailable. Reload and try again.');
    const token = await user.getIdToken();
    const url = new URL(`${path}.json`, base);
    url.searchParams.set('auth', token);
    // Send the short-lived ID token only to the verified Firebase database; never log it.
    const response = await fetch(url, {method, signal:AbortSignal.timeout(15000), cache:'no-store', headers:body ? {'Content-Type':'application/json'} : {}, body:body ? JSON.stringify(body) : undefined});
    if (!response.ok) throw Error(response.status === 401 || response.status === 403 ? 'Firebase denied access. Check Anonymous sign-in and the database rules.' : 'Firebase is unavailable. Your local draft is unchanged.');
    return response.json();
  }
  async function shareId(create = false) {
    let id = await request('GET', undefined, `${privatePath}/shareId`);
    if (id && !validShareId(id)) throw Error('The saved share ID is invalid.');
    if (!id && create) {
      id = crypto.randomUUID();
      await request('PUT', id, `${privatePath}/shareId`);
    }
    return id;
  }
  return {
    async save(story) {
      const payload = serialize(story);
      await request('PUT', {version:2, payload, updatedAt:{'.sv':'timestamp'}});
    },
    async load() {
      const record = await request('GET'); if (!record) return null;
      return readStory(record);
    },
    async publish(story) {
      const payload = serialize(story), id = await shareId(true);
      await request('PUT', {version:2, payload, ownerUid:auth.currentUser.uid, enabled:true, updatedAt:{'.sv':'timestamp'}}, `shares/${id}`);
      return id;
    },
    async sharedId() {
      const id = await shareId(); if (!id) return null;
      const record = await request('GET', undefined, `shares/${id}`);
      return record?.enabled ? id : null;
    },
    async unpublish() {
      const id = await shareId(); if (!id) return;
      await request('PATCH', {enabled:false, updatedAt:{'.sv':'timestamp'}}, `shares/${id}`);
    }
  };
}
