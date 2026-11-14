import { resolveCommissionRates, snapshotRates } from './commission-rates';

describe('commission rates', () => {
  it('adds the middleman rate onto the base to make the final rate', () => {
    expect(resolveCommissionRates({ baseRateBps: 300, middlemanRateBps: 200 })).toEqual({
      baseRateBps: 300,
      middlemanRateBps: 200,
      rateBps: 500,
    });
  });

  it('keeps a single rate as the base when no middleman is set', () => {
    expect(resolveCommissionRates({ rateBps: 800 })).toEqual({
      baseRateBps: 800,
      middlemanRateBps: 0,
      rateBps: 800,
    });
  });

  it('refuses a final rate above 100%', () => {
    expect(() => resolveCommissionRates({ baseRateBps: 9000, middlemanRateBps: 2000 })).toThrow(
      'Final rate cannot exceed 100%',
    );
  });

  it('reads older rules that only stored the charged rate', () => {
    expect(snapshotRates({ rateBps: 800 })).toEqual({
      baseRateBps: 800,
      middlemanRateBps: 0,
      rateBps: 800,
    });
  });
});
