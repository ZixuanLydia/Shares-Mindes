import {newStory, scene, normalizeStory, fromWeek3, moveScene, clamp, MAX_SCENES, MAX_PIECES, MAX_BYTES} from './story.js';
import {connectCloud} from './cloud.js';
const $ = id => document.getElementById(id);
const KEY = 'share-mind-small-pieces-week04-v2';
let story = newStory(), active = 0, selected = null, removed = null, removedScene = null;
let saveTimer, playTimer, playing = false, uploading = false, cloudBusy = false, cloud = null, savedCloudJSON = null;
const currentScene = () => story.scenes[active];
const current = () => currentScene().items.find(i => i.id === selected);
const status = message => { $('status').textContent = message; };
const cloudStatus = message => { $('cloudStatus').textContent = message; };
let restoreError = '';
try { const raw = localStorage.getItem(KEY); if (raw) story = normalizeStory(JSON.parse(raw)); }
catch { restoreError = 'Could not restore the local draft. Import a JSON backup if you have one.'; }

function persist() {
  clearTimeout(saveTimer);
  try { localStorage.setItem(KEY, JSON.stringify(story)); status('Local draft saved · cloud saves separately'); }
  catch { status('Local draft not saved: storage is full or unavailable. Export JSON now.'); }
  if (cloud && savedCloudJSON !== null && JSON.stringify(story) !== savedCloudJSON) cloudStatus('Changes are local only. Click Save to cloud to update your cloud copy.');
  renderScenes();
}
function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 200); }
async function confirmAction(title, message) {
  $('confirmTitle').textContent = title; $('confirmMessage').textContent = message;
  const dialog = $('confirmDialog'); dialog.returnValue = 'cancel';
  return new Promise(resolve => { dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), {once: true}); dialog.showModal(); });
}
function position(el, item, index = 0) {
  el.style.left = item.x + '%'; el.style.top = item.y + '%'; el.style.width = item.size + '%';
  el.style.setProperty('--rotation', item.rotation + 'deg'); el.style.setProperty('--delay', -(index % 4) + 's');
  el.classList.toggle('floating', item.float);
}
function controls() {
  const item = current(); $('controls').disabled = !item || playing || cloudBusy;
  $('selectHint').textContent = item ? item.name : 'Click a piece on the canvas to adjust it.';
  if (item) { $('size').value = item.size; $('sizeValue').value = Math.round(item.size) + '%'; $('rotation').value = item.rotation; $('rotationValue').value = Math.round(item.rotation) + '°'; $('float').checked = item.float; }
  for (const el of $('board').querySelectorAll('.piece')) { el.classList.toggle('selected', !playing && el.dataset.id === selected); el.setAttribute('aria-pressed', String(!playing && el.dataset.id === selected)); }
}
function select(id) { if (playing || cloudBusy) return; selected = id; controls(); }
function renderScenes() {
  $('scenes').replaceChildren();
  story.scenes.forEach((s, index) => {
    const button = document.createElement('button'); button.className = 'scene-card'; button.classList.toggle('active', index === active);
    button.setAttribute('aria-current', String(index === active)); button.setAttribute('aria-label', `Scene ${index + 1}: ${s.title || 'Untitled'}`); button.disabled = playing || uploading || cloudBusy;
    const thumb = document.createElement('span'); thumb.className = 'scene-thumb';
    s.items.forEach(item => { const img = document.createElement('img'); img.src = item.src; img.alt = ''; img.style.left = item.x + '%'; img.style.top = item.y + '%'; img.style.width = item.size + '%'; img.style.transform = `translate(-50%, -50%) rotate(${item.rotation}deg)`; thumb.append(img); });
    const label = document.createElement('span'); label.className = 'scene-label'; label.textContent = `${String(index + 1).padStart(2, '0')} · ${s.title || 'Untitled'}`;
    const duration = document.createElement('span'); duration.className = 'scene-time'; duration.textContent = `${s.duration}s`;
    button.append(thumb, label, duration); button.onclick = () => switchScene(index); $('scenes').append(button);
  });
  $('sceneCount').textContent = `${story.scenes.length} / ${MAX_SCENES} scenes`;
  const locked = playing || uploading || cloudBusy;
  $('addScene').disabled = $('duplicateScene').disabled = locked || story.scenes.length >= MAX_SCENES;
  $('earlier').disabled = locked || active === 0; $('later').disabled = locked || active === story.scenes.length - 1;
  $('deleteScene').disabled = locked || story.scenes.length === 1;
  $('undoScene').hidden = !removedScene; $('undoScene').disabled = locked || story.scenes.length >= MAX_SCENES;
  $('play').textContent = playing ? 'Stop playback' : 'Play from start'; $('play').disabled = uploading || cloudBusy;
  for (const id of ['storyTitle', 'author', 'title', 'caption', 'duration', 'upload', 'import', 'copyWeek3', 'undo']) $(id).disabled = locked;
  for (const button of $('starters').querySelectorAll('button')) button.disabled = locked;
  $('saveCloud').disabled = $('loadCloud').disabled = $('publish').disabled = $('unpublish').disabled = !cloud || locked;
  controls();
}
function draw() {
  for (const el of $('board').querySelectorAll('.piece')) el.remove();
  currentScene().items.forEach((item, index) => {
    const el = document.createElement('button'); el.className = 'piece'; el.dataset.id = item.id;
    el.setAttribute('aria-label', item.name + '; use arrow keys to move'); el.disabled = playing || cloudBusy;
    const img = document.createElement('img'); img.src = item.src; img.alt = ''; img.draggable = false;
    el.append(img); position(el, item, index); el.onclick = () => select(item.id);
    el.onpointerdown = e => {
      if (e.button !== 0 || playing || cloudBusy) return;
      select(item.id); const r = $('board').getBoundingClientRect(), start = {x:e.clientX, y:e.clientY, ix:item.x, iy:item.y};
      el.setPointerCapture(e.pointerId);
      const move = ev => { item.x = clamp(start.ix + (ev.clientX - start.x) / r.width * 100, 5, 95); item.y = clamp(start.iy + (ev.clientY - start.y) / r.height * 100, 5, 95); position(el, item, index); };
      const end = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', end); el.removeEventListener('pointercancel', end); persist(); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    };
    el.onkeydown = e => {
      if (playing || cloudBusy || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault(); select(item.id); const step = e.shiftKey ? 5 : 1;
      item.x = clamp(item.x + (e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0), 5, 95);
      item.y = clamp(item.y + (e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0), 5, 95); position(el, item, index); persist();
    };
    $('board').append(el);
  });
  $('count').textContent = currentScene().items.length + ' / 12 pieces'; $('empty').hidden = currentScene().items.length > 0;
  $('title').value = currentScene().title; $('caption').value = currentScene().caption; $('duration').value = currentScene().duration;
  $('storyTitle').value = story.title; $('author').value = story.author; $('board').classList.toggle('playing', playing); renderScenes();
}
function switchScene(index) { if (playing || uploading || cloudBusy) return; persist(); active = index; selected = null; removed = null; $('undo').hidden = true; draw(); }
function add(src, name) {
  if (currentScene().items.length >= MAX_PIECES) { status('This scene holds 12 pieces. Remove one before adding another.'); return; }
  const count = currentScene().items.length;
  const item = {id: crypto.randomUUID(), name: String(name).slice(0,80), src, x: 35 + (count * 13) % 35, y: 35 + (count * 17) % 35, size: 26, rotation: 0, float: false};
  currentScene().items.push(item); selected = item.id; draw(); persist();
}
$('board').onclick = e => { if (e.target === $('board')) select(null); };
for (const id of ['size', 'rotation', 'float']) $(id).oninput = () => {
  const item = current(); if (!item || playing || cloudBusy) return;
  item[id] = id === 'float' ? $(id).checked : Number($(id).value);
  position($('board').querySelector(`[data-id="${item.id}"]`), item); controls(); saveSoon();
};
$('front').onclick = () => { const item = current(); if (!item) return; currentScene().items = currentScene().items.filter(i => i.id !== item.id); currentScene().items.push(item); draw(); persist(); };
$('remove').onclick = () => { const item = current(); if (!item) return; removed = {item, index:currentScene().items.indexOf(item)}; currentScene().items = currentScene().items.filter(i => i.id !== item.id); selected = null; $('undo').hidden = false; draw(); persist(); };
$('undo').onclick = () => { if (!removed || currentScene().items.length >= MAX_PIECES) return; currentScene().items.splice(removed.index, 0, removed.item); selected = removed.item.id; removed = null; $('undo').hidden = true; draw(); persist(); };
for (const [id, key] of [['title','title'], ['caption','caption'], ['duration','duration']]) $(id).oninput = () => { currentScene()[key] = id === 'duration' ? Number($(id).value) : $(id).value; saveSoon(); };
for (const [id,key] of [['storyTitle','title'], ['author','author']]) $(id).oninput = () => { story[key] = $(id).value; saveSoon(); };
function createScene(duplicate) {
  if (story.scenes.length >= MAX_SCENES) return;
  const next = duplicate ? structuredClone(currentScene()) : scene(); next.id = crypto.randomUUID();
  next.items.forEach(item => { item.id = crypto.randomUUID(); });
  if (duplicate) next.title = ((next.title || 'Scene') + ' (copy)').slice(0,80);
  story.scenes.splice(active + 1, 0, next); active++; selected = null; removed = null; $('undo').hidden = true; draw(); persist();
}
$('addScene').onclick = () => createScene(false); $('duplicateScene').onclick = () => createScene(true);
$('earlier').onclick = () => { active = moveScene(story, active, -1); draw(); persist(); };
$('later').onclick = () => { active = moveScene(story, active, 1); draw(); persist(); };
$('deleteScene').onclick = () => { if (story.scenes.length < 2) return; removedScene = {scene: currentScene(), index: active}; story.scenes.splice(active,1); active = Math.min(active,story.scenes.length-1); selected = null; removed = null; $('undo').hidden = true; draw(); persist(); };
$('undoScene').onclick = () => { if (!removedScene || story.scenes.length >= MAX_SCENES) return; active = Math.min(removedScene.index,story.scenes.length); story.scenes.splice(active,0,removedScene.scene); removedScene = null; selected = null; removed = null; $('undo').hidden = true; draw(); persist(); };
function stopPlayback(message = 'Playback stopped. You can edit again.') { clearTimeout(playTimer); playing = false; $('playStatus').textContent = message; draw(); }
function advancePlayback() {
  draw(); $('playStatus').textContent = `Playing scene ${active + 1} of ${story.scenes.length} · ${currentScene().duration}s`;
  playTimer = setTimeout(() => { if (active < story.scenes.length - 1) { active++; advancePlayback(); } else stopPlayback('Finished. Try a different order.'); }, currentScene().duration * 1000);
}
$('play').onclick = () => { if (playing) return stopPlayback(); persist(); selected = null; removed = null; $('undo').hidden = true; active = 0; playing = true; advancePlayback(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && playing) stopPlayback(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && playing) stopPlayback('Paused when you left the page. Play again when ready.'); });
$('export').onclick = () => { const url = URL.createObjectURL(new Blob([JSON.stringify(story)],{type:'application/json'})); const a = document.createElement('a'); a.href = url; a.download = 'small-pieces-week04.json'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url),10000); };
function replaceStory(next) { story = next; active = 0; selected = null; removed = null; removedScene = null; $('undo').hidden = true; $('playStatus').textContent = ''; draw(); persist(); }
$('import').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  try { if (file.size > MAX_BYTES) throw Error('Choose a JSON file smaller than 3 MB.'); const raw = JSON.parse(await file.text()); const next = raw.version === 1 ? fromWeek3(raw) : normalizeStory(raw);
    if (await confirmAction('Open this JSON story?', 'This replaces the current local draft. Cancel and export your draft first if you want to keep both.')) replaceStory(next);
  } catch (error) { status(error.message); }
};
$('copyWeek3').onclick = async () => {
  try { const raw = localStorage.getItem('share-mind-small-pieces-v1'); if (!raw) throw Error('No Week 3 collage found on this browser and website. Export JSON from Week 3, then import it here.');
    const next = fromWeek3(JSON.parse(raw)); if (await confirmAction('Start from your Week 3 collage?', 'Your Week 3 original stays unchanged. This replaces only the current Week 4 draft; export it first if you want to keep it.')) replaceStory(next);
  } catch (error) { status(error.message); }
};
async function imageData(file) {
  if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw Error('Please choose a PNG, JPG or WebP image.');
  if (file.size > 15000000) throw Error('Please choose images smaller than 15 MB.');
  const bmp = await createImageBitmap(file); if (bmp.width * bmp.height > 40000000) { bmp.close(); throw Error('That image is too large. Try a smaller copy.'); }
  const canvas = document.createElement('canvas'), ratio = Math.min(1,420/Math.max(bmp.width,bmp.height)); canvas.width = Math.max(1,Math.round(bmp.width*ratio)); canvas.height = Math.max(1,Math.round(bmp.height*ratio));
  canvas.getContext('2d').drawImage(bmp,0,0,canvas.width,canvas.height); bmp.close(); return canvas.toDataURL('image/webp',.82);
}
$('upload').onchange = async e => {
  const files = [...e.target.files]; uploading = true; renderScenes(); let error = '';
  for (const file of files) { if (currentScene().items.length >= MAX_PIECES) { error = 'This scene holds 12 pieces. Extra images were not added.'; break; } try { add(await imageData(file),file.name.replace(/\.[^.]+$/,'')); } catch (e) { error = e.message; } }
  $('upload').value = ''; uploading = false; renderScenes(); if (error) status(error);
};
fetch('assets.json').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(assets => {
  $('starterSection').hidden = false;
  for (const asset of assets) { const button = document.createElement('button'); button.setAttribute('aria-label','Add '+asset.name); const img = document.createElement('img'); img.src = asset.src; img.alt = asset.name; button.append(img); button.onclick = () => add(asset.src,asset.name); $('starters').append(button); }
  renderScenes();
}).catch(() => status('Starter images could not load. You can still add your own images.'));
function cloudError(error) {
  if (error.name === 'AbortError' || error.name === 'TimeoutError') return 'The request timed out. Cloud save is unconfirmed; your local draft is unchanged. Try again when online.';
  if (['auth/operation-not-allowed','auth/admin-restricted-operation'].includes(error.code)) return 'Cloud setup is not finished: enable Anonymous sign-in in Firebase, then reload this page. Your local draft is safe.';
  return error.message || 'Cloud connection failed. Your local draft is unchanged.';
}
$('saveCloud').onclick = async () => {
  if (!cloud || cloudBusy) return;
  cloudBusy = true; draw(); cloudStatus('Saving cloud copy…');
  const snapshot = JSON.stringify(story);
  try { await cloud.save(story); savedCloudJSON = snapshot; cloudStatus('Cloud copy saved. You can reopen it with this browser identity.'); }
  catch (error) { cloudStatus(cloudError(error)); } finally { cloudBusy = false; draw(); }
};
$('loadCloud').onclick = async () => {
  if (!cloud || cloudBusy) return;
  cloudBusy = true; draw(); cloudStatus('Opening cloud copy…');
  try { const next = await cloud.load(); if (!next) { cloudStatus('No cloud copy yet. Save your story first.'); return; }
    if (await confirmAction('Open your cloud copy?', 'This replaces the current local draft with your last cloud save. Cancel and export first if you want to keep this draft.')) { replaceStory(next); savedCloudJSON = JSON.stringify(story); cloudStatus('Cloud copy opened.'); }
    else cloudStatus('Opening canceled. Your local draft is unchanged.');
  } catch (error) { cloudStatus(cloudError(error)); } finally { cloudBusy = false; draw(); }
};
function showShare(id) {
  $('shareLink').hidden = $('copyShare').hidden = $('unpublish').hidden = !id;
  if (id) { const url = new URL('view.html', location.href); url.searchParams.set('story', id); $('shareLink').href = url.href; $('shareLink').textContent = url.href; }
}
$('publish').onclick = async () => {
  if (!cloud || cloudBusy) return;
  if (!await confirmAction('Share this story?', 'Your images, captions and name will be readable by anyone who has the link. This also updates any earlier shared snapshot. Your private cloud copy is saved separately.')) return;
  cloudBusy = true; draw(); $('shareStatus').textContent = 'Publishing a read-only snapshot…';
  try { showShare(await cloud.publish(story)); $('shareStatus').textContent = ['localhost','127.0.0.1'].includes(location.hostname) ? 'Snapshot shared. This preview link only works on this computer; publish the website before sending it to your teacher.' : 'Ready to share. The link opens a read-only player, with no login needed.'; }
  catch (error) { $('shareStatus').textContent = cloudError(error); } finally { cloudBusy = false; draw(); }
};
$('copyShare').onclick = async () => { try { await navigator.clipboard.writeText($('shareLink').href); $('shareStatus').textContent = 'Link copied.'; } catch { $('shareStatus').textContent = 'Select the link and copy it manually.'; } };
$('unpublish').onclick = async () => {
  if (!cloud || cloudBusy || !await confirmAction('Turn sharing off?', 'The link will stop working for future visitors. Your local draft and cloud copy stay saved. You can enable sharing again later.')) return;
  cloudBusy = true; draw();
  try { await cloud.unpublish(); showShare(null); $('shareStatus').textContent = 'Sharing is off. Your private copies are unchanged.'; }
  catch (error) { $('shareStatus').textContent = cloudError(error); } finally { cloudBusy = false; draw(); }
};
connectCloud().then(async connection => { cloud = connection; if (cloud) { cloudStatus('Firebase connected. Save to cloud when your story is ready.'); try { showShare(await cloud.sharedId()); } catch { $('shareStatus').textContent = 'Could not check an existing share. You can try publishing again.'; } } renderScenes(); }).catch(error => cloudStatus(cloudError(error)));
window.addEventListener('pagehide', persist); draw(); if (restoreError) status(restoreError);
if (document.modelContext?.registerTool) {
  try { Promise.resolve(document.modelContext.registerTool({name:'get_story',description:'Read this story’s ordered scenes, captions and editable piece positions. Does not include image bytes.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute: input => { if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw Error('Expected an empty object.'); return {title:story.title,scenes:story.scenes.map(s => ({...s,items:s.items.map(({src,...item}) => item)}))}; }})).catch(() => {}); } catch {}
}
