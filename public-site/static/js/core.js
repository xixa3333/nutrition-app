export const $ = selector => document.querySelector(selector);
export const $$ = selector => [...document.querySelectorAll(selector)];
export const state = { session: { authenticated: false }, foods: [], foodPage: 1, foodPages: 1, profile: { targets: { calories: 2000 } } };
export async function api(path, options = {}) {
  const response = await fetch('/api' + path, { ...options, headers: { 'content-type': 'application/json', ...options.headers } });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401) location.href = '/signin-with-chatgpt?return_to=/'; throw new Error(data.error || '請求失敗'); }
  return data;
}
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
export const num = value => Math.round((Number(value) || 0) * 10) / 10;
export function toast(message) { const element = $('#toast'); element.textContent = message; element.classList.add('show'); setTimeout(() => element.classList.remove('show'), 2200); }
export function foodCard(food, options = {}) {
  const { add = true, mealType = '早餐', adminDelete = false } = options, serving = num(food.serving_g || 100), ratio = serving / 100;
  return `<article class="food-card"><h3>${esc(food.name)}</h3><p>${esc(food.category || '未分類')} · ${esc(food.serving_label || '1 份')} ${serving}g</p><small>${esc(food.serving_source || '食品資料庫基準')}</small><div class="nutrients"><span><b>${num(food.calorie * ratio)}</b>kcal</span><span><b>${num(food.protein * ratio)}</b>蛋白質</span><span><b>${num(food.fat * ratio)}</b>脂肪</span><span><b>${num(food.carb * ratio)}</b>碳水</span></div>${add ? `<div class="food-actions"><select aria-label="餐別">${['早餐','午餐','晚餐','點心'].map(value => `<option${value === mealType ? ' selected' : ''}>${value}</option>`).join('')}</select><input type="number" value="${serving}" min="1" max="5000" aria-label="食用公克數"><button data-add="${food.id}">加入日記</button></div>` : ''}${adminDelete ? `<button class="danger admin-only" data-admin-delete="${food.id}">從資料庫刪除</button>` : ''}</article>`;
}
