import { describe, expect, it } from 'vitest';
import { mealContext } from '../../server/domain/meal-planning';
describe('meal schedule recommendations', () => {
  it('recommends an unrecorded meal in its two-hour window', () => { expect(mealContext(7.5, [], 500).meal_type).toBe('早餐'); expect(mealContext(13, ['早餐'], 500).meal_type).toBe('午餐'); expect(mealContext(19, ['早餐', '午餐'], 500).meal_type).toBe('晚餐'); });
  it('anticipates a meal within two hours', () => expect(mealContext(16.5, ['早餐', '午餐'], 500).meal_type).toBe('晚餐'));
  it('offers snacks between meals and after dinner only with a gap', () => { expect(mealContext(9.5, ['早餐'], 500).meal_type).toBe('點心'); expect(mealContext(21, ['早餐', '午餐', '晚餐'], 500).meal_type).toBe('點心'); expect(mealContext(21, ['早餐', '午餐', '晚餐'], 0).reason).toContain('達成'); });
  it('bounds invalid hours', () => expect(mealContext(Number.NaN, [], 500).meal_type).toBe('午餐'));
});
