import { quoteMiddlemanRefund, quoteMiddlemanSplit } from './commission-split';

describe('middleman commission split', () => {
  it('splits a 6% salon cut into a 3% middleman share and a 3% Stylio share', () => {
    const split = quoteMiddlemanSplit({
      amountPaise: 1_000_000,
      salonRateBps: 600,
      middlemanRateBps: 300,
      salonCommissionPaise: 60_000,
    });
    expect(split).toEqual({ middlemanCommissionPaise: 30_000, stylioCommissionPaise: 30_000 });
  });

  it('returns null when the middleman rate is above the salon rate', () => {
    expect(
      quoteMiddlemanSplit({
        amountPaise: 1_000_000,
        salonRateBps: 600,
        middlemanRateBps: 700,
        salonCommissionPaise: 60_000,
      }),
    ).toBeNull();
  });

  it('adjusts a partial refund from the snapshotted middleman rate', () => {
    expect(
      quoteMiddlemanRefund({
        refundPaise: 500_000,
        middlemanRateBps: 300,
        salonReversalPaise: 30_000,
        remainingMiddlemanPaise: 30_000,
        remainingStylioPaise: 30_000,
      }),
    ).toEqual({ middlemanReversalPaise: 15_000, stylioReversalPaise: 15_000 });
  });

  it('clears both shares on a full refund', () => {
    expect(
      quoteMiddlemanRefund({
        refundPaise: 1_000_000,
        middlemanRateBps: 300,
        salonReversalPaise: 60_000,
        remainingMiddlemanPaise: 30_000,
        remainingStylioPaise: 30_000,
      }),
    ).toEqual({ middlemanReversalPaise: 30_000, stylioReversalPaise: 30_000 });
  });
});
