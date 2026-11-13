const SECRET_KEYS = new Set([
  'passwordHash',
  'refreshTokenHash',
  'otpHash',
  'otpExpiresAt',
  'codeHash',
  '__v',
]);

export function toPublic(value: unknown): any {
  if (value == null) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => toPublic(item));
  if (typeof value === 'object') {
    const record = value as Record<string, unknown> & { toObject?: () => Record<string, unknown> };
    const source = typeof record.toObject === 'function' ? record.toObject() : record;
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(source)) {
      if (SECRET_KEYS.has(key)) continue;
      if (key === '_id') {
        out.id = String(nested);
        continue;
      }
      out[key] = toPublic(nested);
    }
    return out;
  }
  return value;
}
