import { createHash, randomInt } from 'crypto';

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
