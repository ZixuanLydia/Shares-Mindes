import {listStories} from './social-cloud.js';
import {demoStories,filterStories} from './social-demo.js';
const $ = id => document.getElementById(id);
let stories = [], shown = [], generation = 0, loadError = '';
const link = entry => `view.html?${$('source').value === 'demo' ? 'demo' : 'story'}=${encodeURIComponent(entry.id)}`;
function render() {
  shown = filterStories(stories,$('search').value); $('gallery').replaceChildren();
  $('surprise').disabled = !shown.length;
  if (loadError) { $('galleryStatus').textContent = loadError; return; }
  for (const entry of shown) {
    const card = document.createElement('a'); card.className = 'story-tile'; card.href = link(entry);
    const thumb = document.createElement('div'); thumb.className = 'scene-thumb gallery-thumb'; thumb.setAttribute('aria-hidden','true');
    entry.story.scenes[0].items.forEach(item => {
      const img = document.createElement('img'); img.src = item.src; img.alt = ''; img.loading = 'lazy';
      Object.assign(img.style,{left:item.x+'%',top:item.y+'%',width:item.size+'%',transform:`translate(-50%,-50%) rotate(${item.rotation}deg)`}); thumb.append(img);
    });
    const author = document.createElement('p'); author.className = 'eyebrow'; author.textContent = entry.story.author || 'Unnamed visitor';
    const title = document.createElement('h2'); title.textContent = entry.story.title || 'An untitled story';
    const detail = document.createElement('p'); detail.textContent = `${entry.story.scenes.length} scenes · Open & respond ↗`;
    card.append(thumb,author,title,detail); $('gallery').append(card);
  }
  $('galleryStatus').textContent = $('source').value === 'demo' ? `${shown.length} simulated stories. These are fictional examples, not real users. Replies are disabled.` : shown.length ? `${shown.length} stories. Take your time with one.` : stories.length ? 'No matching stories. Try a different word.' : 'No published stories yet. Make one and publish it to start the conversation.';
}
async function load() {
  const run = ++generation; stories = []; loadError = ''; render(); $('galleryStatus').textContent = 'Loading…'; $('refresh').disabled = true;
  try { const result = $('source').value === 'demo' ? demoStories : await listStories(); if (run !== generation) return; stories = result; render(); }
  catch(error) { if (run === generation) { loadError = `${error.message} You can explore the clearly labeled demo while setup is pending.`; render(); } }
  finally { if (run === generation) $('refresh').disabled = false; }
}
$('search').oninput = render; $('source').onchange = load; $('refresh').onclick = load;
$('surprise').onclick = () => { if (shown.length) location.href = link(shown[Math.floor(Math.random()*shown.length)]); };
load();
