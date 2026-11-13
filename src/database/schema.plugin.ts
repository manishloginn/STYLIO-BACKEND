import { randomUUID } from 'crypto';
import { Schema } from 'mongoose';

export function uuidSchema(definition: Record<string, unknown>, collection: string) {
  const schema = new Schema(
    {
      _id: { type: String, default: () => randomUUID() },
      ...definition,
    },
    { collection, timestamps: true, versionKey: false },
  );
  return schema;
}
