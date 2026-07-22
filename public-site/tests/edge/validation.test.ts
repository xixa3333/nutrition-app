import { describe, expect, it } from 'vitest';
import { validateFood, validateProfile } from '../../server/domain/validation';
describe('edge validation', () => {
  it.each([0, 121, NaN, Infinity])('rejects invalid ages: %s', age => expect(() => validateProfile({ age, height: 165, weight: 60 })).toThrow());
  it('clips long personal text and defaults enumerations', () => { const result = validateProfile({ nickname: 'x'.repeat(100), age: 30, height: 165, weight: 60, allergens: 'a'.repeat(500), activity_level: 'root', goal_type: 'destroy' }); expect(result.nickname).toHaveLength(40); expect(result.allergens).toHaveLength(300); expect(result.activity_level).toBe('light'); expect(result.goal_type).toBe('maintain'); });
  it('rejects missing names and negative nutrition', () => { expect(() => validateFood({ name: '', category: '' })).toThrow(); expect(() => validateFood({ name: 'x', category: 'y', calorie: -1, protein: 0, fat: 0, carb: 0, fiber: 0 })).toThrow(); });
  it('rejects zero, negative and excessive serving weights', () => { const food = { name: 'x', category: 'y', calorie: 1, protein: 0, fat: 0, carb: 0, fiber: 0 }; for (const serving_g of [0, -1, 5001, Infinity]) expect(() => validateFood({ ...food, serving_g })).toThrow(); });
});
