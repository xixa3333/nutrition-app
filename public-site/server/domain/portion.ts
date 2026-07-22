import type { FoodCandidate } from './types';

export type Portion = { serving_g: number; serving_label: string; serving_source: string };
const OFFICIAL = '國健署六大類食物代換份量';
const COMMON = '常用單份估算（可自行調整）';
const clamp = (value: number, min = 10, max = 500) => Math.round(Math.min(max, Math.max(min, value)));

export function inferPortion(food: Partial<FoodCandidate>): Portion {
  const text = `${food.name || ''} ${food.category || ''}`;
  if (/蛋餅/.test(text)) return { serving_g: 60, serving_label: '1 份', serving_source: COMMON };
  if (/乳|奶|優格|優酪/.test(text)) return { serving_g: 240, serving_label: '1 杯', serving_source: OFFICIAL };
  if (/蔬菜|青菜|菇|葉菜/.test(text)) return { serving_g: 100, serving_label: '1 份', serving_source: OFFICIAL };
  if (/水果|果類/.test(text)) return { serving_g: 100, serving_label: '1 份', serving_source: OFFICIAL };
  if (/白飯|糙米飯|雜糧飯|米飯/.test(text)) return { serving_g: 200, serving_label: '1 碗', serving_source: OFFICIAL };
  if (/地瓜|蕃薯|芋頭/.test(text)) return { serving_g: 110, serving_label: '1 個', serving_source: OFFICIAL };
  if (/蛋類|雞蛋|鴨蛋/.test(text)) return { serving_g: 50, serving_label: '1 個', serving_source: COMMON };
  const protein = Number(food.protein) || 0, carb = Number(food.carb) || 0;
  if (/豆|魚|肉|海鮮/.test(text) && protein > 0) return { serving_g: clamp(700 / protein), serving_label: '1 份', serving_source: OFFICIAL };
  if (/穀|飯|麵|吐司|麵包|澱粉/.test(text) && carb > 0) return { serving_g: clamp(1500 / carb), serving_label: '1 份', serving_source: OFFICIAL };
  return { serving_g: 100, serving_label: '1 份', serving_source: '食品資料庫每 100 公克基準' };
}

export function withPortion<T extends Partial<FoodCandidate>>(food: T): T & Portion {
  const inferred = inferPortion(food);
  return { ...food, serving_g: positive(food.serving_g) || inferred.serving_g, serving_label: food.serving_label || inferred.serving_label, serving_source: food.serving_source || inferred.serving_source };
}
const positive = (value: unknown) => { const number = Number(value); return Number.isFinite(number) && number > 0 && number <= 5000 ? number : 0; };
