import {loadSharedStory} from './cloud.js';
const $ = id => document.getElementById(id);
let story, active = 0, playing = false, timer;
function draw() {
  const scene = story.scenes[active];
  $('sceneTitle').textContent = scene.title || `Scene ${active + 1}`;
  $('caption').textContent = scene.caption;
  $('board').replaceChildren(); $('scenes').replaceChildren();
  scene.items.forEach((item,index) => {
    const piece = document.createElement('div'); piece.className = 'piece'; piece.classList.toggle('floating',item.float);
    piece.style.left = item.x + '%'; piece.style.top = item.y + '%'; piece.style.width = item.size + '%'; piece.style.setProperty('--rotation',item.rotation+'deg'); piece.style.setProperty('--delay',-(index%4)+'s');
    const img = document.createElement('img'); img.src = item.src; img.alt = item.name; piece.append(img); $('board').append(piece);
  });
  story.scenes.forEach((s,index) => {
    const button = document.createElement('button'); button.className = 'scene-card'; button.classList.toggle('active',index===active); button.setAttribute('aria-current',String(index===active)); button.textContent = `${index+1} · ${s.title || 'Untitled'} · ${s.duration}s`; button.disabled = playing;
    button.onclick = () => { active = index; draw(); }; $('scenes').append(button);
  });
  $('play').textContent = playing ? 'Stop playback' : 'Play from start';
  $('status').textContent = `${playing ? 'Playing' : 'Scene'} ${active+1} of ${story.scenes.length} · ${scene.duration} seconds`;
}
function stop() { clearTimeout(timer); playing = false; draw(); }
function advance() { draw(); timer = setTimeout(() => { if (active + 1 < story.scenes.length) { active++; advance(); } else { stop(); $('status').textContent = 'Finished. You can play again or choose a scene.'; } },story.scenes[active].duration*1000); }
$('play').onclick = () => { if (playing) return stop(); active = 0; playing = true; advance(); };
document.addEventListener('keydown',e => { if (e.key==='Escape' && playing) stop(); });
document.addEventListener('visibilitychange',() => { if (document.hidden && playing) stop(); });
try { story = await loadSharedStory(new URLSearchParams(location.search).get('story')); $('storyTitle').textContent = story.title || 'An untitled story'; $('author').textContent = story.author ? `Made by ${story.author}` : ''; $('play').disabled = false; draw(); }
catch (error) { $('storyTitle').textContent = 'Story unavailable'; $('status').textContent = error.name==='TimeoutError' ? 'Loading timed out. Check your connection and reload.' : error.message; }
