import {connectCloud,listReplies} from './social-cloud.js';
const $ = id => document.getElementById(id), params = new URLSearchParams(location.search), id = params.get('story');
let cloud, busy = false;
const message = text => { $('replyStatus').textContent = text; };
try { $('replyName').value = localStorage.getItem('small-pieces-nickname') || ''; } catch {}
function locked(value) { busy = value; for(const key of ['sendReply','removeReply','refreshReplies']) $(key).disabled = value || (key !== 'refreshReplies' && !cloud); }
async function load() {
  const replies = await listReplies(id); $('replyList').replaceChildren(); $('removeReply').hidden = true;
  for (const reply of replies) {
    const article = document.createElement('article'), name = document.createElement('strong'), text = document.createElement('p');
    name.textContent = `${reply.nickname}${reply.id === cloud?.uid ? ' · you' : ''}`; text.textContent = reply.text; article.append(name,text); $('replyList').append(article);
    if (reply.id === cloud?.uid) { $('removeReply').hidden = false; }
  }
  // Offer deletion even if the user's older reply falls outside the latest-20 list.
  if (cloud) $('removeReply').hidden = false;
  message(replies.length ? 'Read slowly. What would you add?' : 'No replies yet. You can start with one small observation.');
}
$('replyStarter').onchange = () => { if (!$('replyText').value.trim()) $('replyText').value = $('replyStarter').value.replace('…',' '); $('replyText').focus(); };
$('replyForm').onsubmit = async event => {
  event.preventDefault(); if (!cloud || busy) return; locked(true);
  try { await cloud.reply(id,$('replyName').value,$('replyText').value); try { localStorage.setItem('small-pieces-nickname',$('replyName').value); } catch {} await load(); message('Your public reply is saved. Saving again replaces it.'); }
  catch(error) { message(error.message); } finally { locked(false); }
};
$('refreshReplies').onclick = async () => { if (busy) return; locked(true); try { await load(); } catch(error) { message(error.message); } finally { locked(false); } };
$('removeReply').onclick = async () => { if (!cloud || busy || !confirm('Delete your reply to this story?')) return; locked(true); try { await cloud.removeReply(id); $('replyText').value = ''; await load(); message('Your reply was removed.'); } catch(error) { message(error.message); } finally { locked(false); } };
if (params.has('demo')) { $('replyForm').hidden = $('refreshReplies').hidden = true; message('Simulated story — replies are disabled. Choose Community to respond to real people.'); }
else {
  locked(true);
  try { await load(); } catch(error) { message(error.message); }
  try { cloud = await connectCloud(); await load(); } catch(error) { message(error.message); } finally { locked(false); }
}
