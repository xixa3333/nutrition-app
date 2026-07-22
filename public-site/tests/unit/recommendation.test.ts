import { describe, expect, it } from 'vitest';
import { calorieBudget, preference, rankFoods } from '../../server/domain/recommendation';
const foods: any[] = [{ id: 1, name: '牛奶', category: '乳品', calorie: 120, protein: 8, fat: 4, carb: 12, fiber: 0, allergens: '奶類' }, { id: 2, name: '豆腐', category: '豆類', calorie: 100, protein: 8, fat: 4, carb: 3, fiber: 1, allergens: '' }];
describe('recommendations', () => {
  it('excludes allergens and caps results', () => expect(rankFoods(foods, ['奶類'], null, 1).map(x => x.id)).toEqual([2]));
  it('learns nutrient and category preference', () => { const pref = preference([{ protein: 8, fat: 4, carb: 3, fiber: 1, category: '豆類' }]); expect(rankFoods(foods, [], pref, 2)[0].id).toBe(2); });
  it('handles meal budget branches', () => { expect(calorieBudget(2000, 1)).toBe(1000); expect(calorieBudget(50, 1)).toBe(100); expect(calorieBudget(600, 2)).toBe(300); expect(calorieBudget(600, 0)).toBe(600); });
});
