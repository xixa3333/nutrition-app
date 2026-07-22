import type { ActivityLevel, GoalType, NutritionProfile, NutritionTargets, NutritionVector } from './types';
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725, very_high: 1.9 };
export const GOAL_FACTORS: Record<GoalType, number> = { lose: .85, maintain: 1, gain: 1.1 };
const MACROS: Record<GoalType, { protein: number; fat: number; carb: number }> = { lose: { protein: .30, fat: .25, carb: .45 }, maintain: { protein: .20, fat: .30, carb: .50 }, gain: { protein: .25, fat: .25, carb: .50 } };
const valid = <T extends string>(value: string, allowed: Record<T, unknown>, fallback: T): T => value in allowed ? value as T : fallback;
export function calculateTargets(profile: NutritionProfile): NutritionTargets {
  const age = bounded(profile.age, 1, 120, 30), height = bounded(profile.height, 80, 250, 165), weight = bounded(profile.weight, 20, 400, 60);
  const bmr = 10 * weight + 6.25 * height - 5 * age + (profile.gender === '男性' ? 5 : -161);
  const activity = valid(profile.activity_level, ACTIVITY_FACTORS, 'light'), goal = valid(profile.goal_type, GOAL_FACTORS, 'maintain');
  const calories = Math.max(1200, Math.round(bmr * ACTIVITY_FACTORS[activity] * GOAL_FACTORS[goal])), ratios = MACROS[goal];
  return { calories, protein: Math.round(calories * ratios.protein / 4), fat: Math.round(calories * ratios.fat / 9), carb: Math.round(calories * ratios.carb / 4), fiber: Math.round(calories / 1000 * 14), bmr: Math.round(bmr), activity, goal };
}
export function calculateDeficit(target: NutritionTargets, consumed: NutritionVector) {
  return { calories: Math.max(0, target.calories - (Number((consumed as any).calorie) || 0)), protein: Math.max(0, target.protein - consumed.protein), fat: Math.max(0, target.fat - consumed.fat), carb: Math.max(0, target.carb - consumed.carb), fiber: Math.max(0, target.fiber - consumed.fiber) };
}
export function bounded(value: unknown, min: number, max: number, fallback: number) { const n = Number(value); return Number.isFinite(n) && n >= min && n <= max ? n : fallback; }
