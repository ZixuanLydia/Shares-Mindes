// Explicitly simulated people and stories. Never uploaded to Firebase.
const names = ['Ari','Bo','Cam','Dee','Em','Finn','Gia','Han','Indi','Jules','Kai','Lou','Mika','Noor','Oli','Paz','Quinn','Ren','Sam','Toni','Uma','Val','Wren','Xia'];
const themes = ['A little closer','Between places','After the rain','A quiet evening'];
export const demoStories = names.map((name,n) => ({id:`demo-${n}`,updatedAt:24-n,story:{version:2,title:themes[n%4],author:`${name} (demo)`,scenes:[0,1,2].map((s) => ({id:`scene-${n}-${s}`,title:['Here','A change','Somewhere else'][s],caption:['A familiar place.','Something small shifts.','What does it feel like now?'][s],duration:2,items:[{id:`piece-${s}`,name:'House',src:'assets/house.png',x:30+s*20,y:65-s*10,size:26,rotation:(n%3-1)*5,float:false},{id:`sky-${s}`,name:n%2?'Moon':'Cloud',src:`assets/${n%2?'moon':'cloud'}.png`,x:65-s*10,y:25+s*5,size:24,rotation:0,float:false}]}))}}));
export function filterStories(entries, query) {
  const needle = query.trim().toLocaleLowerCase();
  return entries.filter(({story}) => `${story.author} ${story.title} ${story.scenes.map(s => s.caption).join(' ')}`.toLocaleLowerCase().includes(needle));
}
