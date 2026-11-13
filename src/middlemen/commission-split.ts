import { MoneyError, percentPaise } from '../common/utils/money';

/** Split an already-calculated salon commission. Null means the middleman rate is above the salon rate. */
export function quoteMiddlemanSplit(input: {
  amountPaise: number;
  salonRateBps: number;
  middlemanRateBps: number;
  salonCommissionPaise: number;
}): { middlemanCommissionPaise: number; stylioCommissionPaise: number } | null {
  if (input.middlemanRateBps > input.salonRateBps) return null;
  const middlemanCommissionPaise = Math.min(
    percentPaise(input.amountPaise, input.middlemanRateBps),
    input.salonCommissionPaise,
  );
  return {
    middlemanCommissionPaise,
    stylioCommissionPaise: input.salonCommissionPaise - middlemanCommissionPaise,
  };
}

/** Divide a salon-commission reversal between the middleman and Stylio using the snapshotted middleman rate. */
export function quoteMiddlemanRefund(input: {
  refundPaise: number;
  middlemanRateBps: number;
  salonReversalPaise: number;
  remainingMiddlemanPaise: number;
  remainingStylioPaise: number;
}): { middlemanReversalPaise: number; stylioReversalPaise: number } {
  const rateShare = Math.min(
    percentPaise(input.refundPaise, input.middlemanRateBps),
    input.remainingMiddlemanPaise,
    input.salonReversalPaise,
  );
  const floorMiddleman = Math.max(0, input.salonReversalPaise - input.remainingStylioPaise);
  const middlemanReversalPaise = Math.min(
    input.remainingMiddlemanPaise,
    input.salonReversalPaise,
    Math.max(rateShare, floorMiddleman),
  );
  const stylioReversalPaise = input.salonReversalPaise - middlemanReversalPaise;
  if (stylioReversalPaise < 0 || stylioReversalPaise > input.remainingStylioPaise) {
    throw new MoneyError('refund split exceeds the remaining commission');
  }
  return { middlemanReversalPaise, stylioReversalPaise };
}
