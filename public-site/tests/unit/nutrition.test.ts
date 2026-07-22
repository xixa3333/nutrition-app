import { describe, expect, it } from 'vitest';
import { bounded, calculateDeficit, calculateTargets } from '../../server/domain/nutrition';
const profile: any = { age: 30, height: 175, weight: 70, gender: '男性', activity_level: 'moderate', goal_type: 'maintain' };
describe('nutrition targets', () => {
  it('uses Mifflin-St Jeor and derives all targets', () => { const target = calculateTargets(profile); expect(target.bmr).toBe(1649); expect(target.calories).toBe(2556); expect(target.protein).toBe(128); expect(target.fiber).toBe(36); });
  it('orders goals and activity levels', () => { expect(calculateTargets({ ...profile, goal_type: 'lose' }).calories).toBeLessThan(calculateTargets(profile).calories); expect(calculateTargets({ ...profile, goal_type: 'gain' }).calories).toBeGreaterThan(calculateTargets(profile).calories); expect(calculateTargets({ ...profile, activity_level: 'very_high' }).calories).toBeGreaterThan(calculateTargets({ ...profile, activity_level: 'sedentary' }).calories); });
  it('never returns less than 1200 kcal', () => expect(calculateTargets({ ...profile, age: 120, height: 80, weight: 20, gender: '女性', goal_type: 'lose' }).calories).toBe(1200));
  it('does not produce negative deficits', () => expect(calculateDeficit(calculateTargets(profile), { calorie: 9999, protein: 999, fat: 999, carb: 999, fiber: 999 } as any)).toEqual({ calories: 0, protein: 0, fat: 0, carb: 0, fiber: 0 }));
  it('bounds invalid values', () => { expect(bounded('x', 1, 2, 1.5)).toBe(1.5); expect(bounded(2, 1, 2, 1.5)).toBe(2); });
});
