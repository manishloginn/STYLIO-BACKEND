export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MoneyError';
  }
}

export function assertPaise(value: number, label = 'amount'): void {
  if (!Number.isInteger(value)) {
    throw new MoneyError(`${label} must be an integer number of paise`);
  }
  if (value < 0) {
    throw new MoneyError(`${label} cannot be negative`);
  }
}

export function addPaise(a: number, b: number): number {
  assertPaise(a, 'left');
  assertPaise(b, 'right');
  return a + b;
}

export function subtractPaise(a: number, b: number): number {
  assertPaise(a, 'left');
  assertPaise(b, 'right');
  if (b > a) {
    throw new MoneyError('insufficient amount');
  }
  return a - b;
}

/** Basis points: 800 = 8.00%. Result is floored so we never round money up. */
export function percentPaise(amount: number, bps: number): number {
  assertPaise(amount, 'amount');
  if (!Number.isInteger(bps) || bps < 0) {
    throw new MoneyError('rate must be a non-negative integer in basis points');
  }
  return Math.floor((amount * bps) / 10_000);
}

/** Whole-number percent: 10 = 10%. */
export function percentOf(amount: number, percent: number): number {
  assertPaise(amount, 'amount');
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new MoneyError('percent must be an integer from 0 to 100');
  }
  return Math.floor((amount * percent) / 100);
}
