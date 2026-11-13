import { BadRequestException } from '@nestjs/common';

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^\d{10}$/.test(local)) {
    throw new BadRequestException('Enter a valid 10-digit mobile number');
  }
  return local;
}
