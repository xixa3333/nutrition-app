import { $, $$, state, api, toast } from './js/core.js';
import { loadFoods, loadCategories, loadToday, loadDiary, loadProfile, loadMine, loadPending } from './js/features.js';

async function loadSession() {
  state.session = await api('/session');
  $('#who').textContent = state.session.authenticated ? `${state.session.name}（${state.session.role === 'admin' ? '管理者' : '使用者'}）` : '訪客';
  $('#identity').textContent = state.session.authenticated ? '登出' : '可信登入';
  $('#identity').href = state.session.authenticated ? '/signout-with-chatgpt?return_to=/' : '/signin-with-chatgpt?return_to=/';
  document.body.classList.toggle('signed-in', state.session.authenticated);
  document.body.classList.toggle('is-admin', state.session.role === 'admin');
}
function page(id) {
  if (!state.session.authenticated && id !== 'home') { location.href = '/signin-with-chatgpt?return_to=/'; return; }
  $$('.page').forEach(node => node.classList.toggle('active', node.id === id));
  $$('nav button').forEach(node => node.classList.toggle('on', node.dataset.page === id));
  ({ diary: loadDiary, profile: loadProfile, upload: loadMine, review: loadPending }[id] || (() => {}))();
}
$$('nav button').forEach(button => button.onclick = () => page(button.dataset.page));
let searchTimer;
$('#foodQuery').oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadFoods, 250); };
$('#category').onchange = loadFoods;
$('#diaryDate').value = new Date().toISOString().slice(0, 10);
$('#diaryDate').onchange = loadDiary;
$('#profileForm').onsubmit = async event => { event.preventDefault(); state.profile = await api('/profile', { method: 'PUT', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); toast('資料已儲存，目標已重新計算'); await loadProfile(); };
$('#foodForm').onsubmit = async event => { event.preventDefault(); await api('/foods', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); event.target.reset(); toast('食物已送出審核'); await loadMine(); };
$('#syncFoods').onclick = async () => { await api('/admin/sync', { method: 'POST' }); toast('食物資料已同步'); await loadFoods(); };

await loadSession();
await Promise.all([loadCategories(), loadFoods()]);
if (state.session.authenticated) { await loadProfile(); await loadToday(); }
