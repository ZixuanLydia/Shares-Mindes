export const MAX_SCENES = 6;
export const MAX_PIECES = 12;
export const MAX_BYTES = 3_000_000;
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const scene = () => ({id: crypto.randomUUID(), title: '', caption: '', duration: 3, items: []});
export const newStory = () => ({version: 2, title: '', author: '', scenes: [scene()]});
const num = (value, fallback, min, max) => clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, min, max);
const str = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const validSource = src => typeof src === 'string' && (/^assets\/(cloud|moon|house)\.png$/.test(src) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(src));
export function normalizeStory(input) {
  if (!input || input.version !== 2 || !Array.isArray(input.scenes) || !input.scenes.length || input.scenes.length > MAX_SCENES) throw Error('Choose a Week 4 story JSON with 1–6 scenes.');
  if (JSON.stringify(input).length > MAX_BYTES) throw Error('This story is too large. Keep the JSON under 3 MB.');
  const scenes = input.scenes.map(s => {
    if (!s || !Array.isArray(s.items) || s.items.length > MAX_PIECES) throw Error('Each scene can contain up to 12 pieces.');
    return {id: crypto.randomUUID(), title: str(s.title, 80), caption: str(s.caption, 240), duration: [2, 3, 5, 8].includes(Number(s.duration)) ? Number(s.duration) : 3,
      items: s.items.map(i => {
        if (!i || !validSource(i.src)) throw Error('The story contains an unsupported image. Use built-in pieces or embedded PNG, JPG or WebP images.');
        return {id: crypto.randomUUID(), name: str(i.name, 80) || 'Image', src: i.src, x: num(i.x, 50, 5, 95), y: num(i.y, 50, 5, 95), size: num(i.size, 26, 10, 50), rotation: num(i.rotation, 0, -180, 180), float: i.float === true};
      })};
  });
  return {version: 2, title: str(input.title, 80), author: str(input.author, 60), scenes};
}
export function fromWeek3(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.items)) throw Error('No valid Week 3 collage was found.');
  return normalizeStory({version: 2, title: input.title, author: '', scenes: [{...scene(), title: input.title, items: input.items}]});
}
export function moveScene(story, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= story.scenes.length) return index;
  [story.scenes[index], story.scenes[target]] = [story.scenes[target], story.scenes[index]];
  return target;
}
