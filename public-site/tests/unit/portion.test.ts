import { describe, expect, it } from 'vitest';
import { inferPortion, withPortion } from '../../server/domain/portion';
describe('standard portions', () => {
  it('uses a 60g default for one egg pancake', () => expect(inferPortion({ name: '原味蛋餅' }).serving_g).toBe(60));
  it.each([['低脂牛奶', 240], ['青菜', 100], ['蘋果水果', 100], ['白飯', 200], ['小地瓜', 110]])('maps official food exchange portions for %s', (name, grams) => expect(inferPortion({ name }).serving_g).toBe(grams));
  it('derives protein and carbohydrate exchanges', () => { expect(inferPortion({ name: '雞肉', protein: 20 }).serving_g).toBe(35); expect(inferPortion({ name: '麵包', carb: 50 }).serving_g).toBe(30); });
  it('preserves a valid database serving and rejects an unsafe one', () => { expect(withPortion({ name: '蛋餅', serving_g: 80 }).serving_g).toBe(80); expect(withPortion({ name: '蛋餅', serving_g: 9000 }).serving_g).toBe(60); });
});
