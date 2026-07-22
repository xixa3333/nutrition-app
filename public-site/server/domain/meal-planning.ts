export type MealType = '早餐' | '午餐' | '晚餐' | '點心';
export type MealContext = { meal_type: MealType; reason: string; scheduled_hour: number | null };
const MEALS = [{ meal_type: '早餐' as const, hour: 7 }, { meal_type: '午餐' as const, hour: 12 }, { meal_type: '晚餐' as const, hour: 18 }];

export function mealContext(hour: number, eaten: string[], calorieDeficit: number): MealContext {
  const now = Number.isFinite(hour) ? Math.min(23.999, Math.max(0, hour)) : 12;
  const consumed = new Set(eaten);
  for (const meal of MEALS) if (!consumed.has(meal.meal_type) && now >= meal.hour && now <= meal.hour + 2) return { meal_type: meal.meal_type, scheduled_hour: meal.hour, reason: `${meal.meal_type}時段已到且尚未記錄` };
  const next = MEALS.find(meal => meal.hour > now && !consumed.has(meal.meal_type));
  if (next && next.hour - now <= 2) return { meal_type: next.meal_type, scheduled_hour: next.hour, reason: `接近 ${next.hour}:00 的${next.meal_type}時間` };
  if (next && calorieDeficit > 150) return { meal_type: '點心', scheduled_hour: null, reason: `距離${next.meal_type}還有一段時間，可補充點心` };
  if (!next && calorieDeficit > 100) return { meal_type: '點心', scheduled_hour: null, reason: '三餐後仍有營養缺口，可補充點心' };
  return { meal_type: next?.meal_type || '點心', scheduled_hour: next?.hour || null, reason: calorieDeficit > 0 ? '依剩餘營養需求推薦' : '今日目標已大致達成' };
}
