import { addPaise, MoneyError, percentOf, percentPaise, subtractPaise } from './money';

describe('money', () => {
  it('adds and subtracts integer paise', () => {
    expect(addPaise(150000, 2000)).toBe(152000);
    expect(subtractPaise(150000, 12000)).toBe(138000);
  });

  it('calculates commission in basis points without floats', () => {
    expect(percentPaise(150000, 800)).toBe(12000);
    expect(percentOf(10000, 10)).toBe(1000);
  });

  it('rejects non-integers', () => {
    expect(() => addPaise(1.5, 1)).toThrow(MoneyError);
    expect(() => percentPaise(100, 8.5 as unknown as number)).toThrow(MoneyError);
  });
});
