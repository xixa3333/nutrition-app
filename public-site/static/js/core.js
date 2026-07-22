export const $ = selector => document.querySelector(selector);
export const $$ = selector => [...document.querySelectorAll(selector)];
export const state = { session: { authenticated: false }, foods: [], profile: { targets: { calories: 2000 } } };
export async function api(path, options = {}) {
  const response = await fetch('/api' + path, { ...options, headers: { 'content-type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401) location.href = '/signin-with-chatgpt?return_to=/'; throw new Error(data.error || '請求失敗'); }
  return data;
}
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const num = value => Math.round((Number(value) || 0) * 10) / 10;
export function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2200); }
export function foodCard(food, action = true) {
  return `<article class="food-card"><h3>${esc(food.name)}</h3><p>${esc(food.category || '未分類')} · 每 ${esc(food.unit || '100g')}</p><div class="nutrients"><span><b>${num(food.calorie)}</b>kcal</span><span><b>${num(food.protein)}</b>蛋白質</span><span><b>${num(food.fat)}</b>脂肪</span><span><b>${num(food.carb)}</b>碳水</span></div>${action ? `<div class="food-actions"><select aria-label="餐別"><option>早餐</option><option>午餐</option><option>晚餐</option><option>點心</option></select><input type="number" value="100" min="1" max="5000" aria-label="食用公克數"><button data-add="${food.id}">加入日記</button></div>` : ''}</article>`;
}
