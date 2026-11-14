import { MongoDoc } from '../common/interfaces/mongo-doc';
import { Model } from 'mongoose';
import { RuleStatus, SalonStatus } from '../common/enums';

/** Final rate is what Stylio charges on a membership sale. It is base plus middleman. */
export function resolveCommissionRates(input: {
  rateBps?: number;
  baseRateBps?: number;
  middlemanRateBps?: number;
}): { baseRateBps: number; middlemanRateBps: number; rateBps: number } {
  const middlemanRateBps = input.middlemanRateBps ?? 0;
  if (input.baseRateBps == null) {
    if (middlemanRateBps !== 0) {
      throw new Error('Set a base rate when a middleman rate is included');
    }
    if (input.rateBps == null) throw new Error('Set a base rate');
    return { baseRateBps: input.rateBps, middlemanRateBps: 0, rateBps: input.rateBps };
  }
  const rateBps = input.baseRateBps + middlemanRateBps;
  if (rateBps > 10_000) throw new Error('Final rate cannot exceed 100%');
  return { baseRateBps: input.baseRateBps, middlemanRateBps, rateBps };
}

export function snapshotRates(rule: {
  rateBps: number;
  baseRateBps?: number | null;
  middlemanRateBps?: number | null;
}) {
  return {
    baseRateBps: rule.baseRateBps ?? rule.rateBps,
    middlemanRateBps: rule.middlemanRateBps ?? 0,
    rateBps: rule.rateBps,
  };
}

function activePlatformQuery(at: Date) {
  return {
    salonId: null,
    status: RuleStatus.ACTIVE,
    effectiveFrom: { $lte: at },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: at } }],
  };
}

/** Copy the current platform default onto a salon that does not already have its own rate. */
export async function giveSalonPlatformDefault(
  rules: Model<MongoDoc>,
  audits: Model<MongoDoc>,
  actorId: string,
  salonId: string,
) {
  const own = await rules.findOne({ salonId, status: RuleStatus.ACTIVE }).lean();
  if (own) return false;
  const now = new Date();
  const platform = await rules.findOne(activePlatformQuery(now)).sort({ effectiveFrom: -1 }).lean();
  if (!platform) return false;
  const rates = snapshotRates({
    rateBps: platform.rateBps,
    baseRateBps: platform.baseRateBps,
    middlemanRateBps: platform.middlemanRateBps,
  });
  const rule = await rules.create({
    salonId,
    baseRateBps: rates.baseRateBps,
    middlemanRateBps: rates.middlemanRateBps,
    rateBps: rates.rateBps,
    effectiveFrom: now,
    effectiveTo: null,
    status: RuleStatus.ACTIVE,
    createdBy: actorId || platform.createdBy,
  });
  await audits.create({
    actorId: actorId || platform.createdBy,
    action: 'COMMISSION_RULE_DEFAULTED',
    entityType: 'commission_rule',
    entityId: rule._id,
    metadata: { salonId, ...rates },
  });
  return true;
}

/** Approved salons with no rate of their own receive the platform default. */
export async function giveApprovedSalonsPlatformDefault(
  rules: Model<MongoDoc>,
  salons: Model<MongoDoc>,
  audits: Model<MongoDoc>,
) {
  const now = new Date();
  const platform = await rules.findOne(activePlatformQuery(now)).sort({ effectiveFrom: -1 }).lean();
  if (!platform) return 0;
  const approved = await salons.find({ status: SalonStatus.APPROVED }).select('_id').lean();
  const ids = approved.map((salon) => salon._id);
  if (!ids.length) return 0;
  const existing = await rules.find({ salonId: { $in: ids }, status: RuleStatus.ACTIVE }).select('salonId').lean();
  const have = new Set(existing.map((rule) => rule.salonId));
  const missing = ids.filter((id) => !have.has(id));
  if (!missing.length) return 0;
  const rates = snapshotRates({
    rateBps: platform.rateBps,
    baseRateBps: platform.baseRateBps,
    middlemanRateBps: platform.middlemanRateBps,
  });
  for (const salonId of missing) {
    const rule = await rules.create({
      salonId,
      baseRateBps: rates.baseRateBps,
      middlemanRateBps: rates.middlemanRateBps,
      rateBps: rates.rateBps,
      effectiveFrom: now,
      effectiveTo: null,
      status: RuleStatus.ACTIVE,
      createdBy: platform.createdBy,
    });
    await audits.create({
      actorId: platform.createdBy,
      action: 'COMMISSION_RULE_DEFAULTED',
      entityType: 'commission_rule',
      entityId: rule._id,
      metadata: { salonId, ...rates },
    });
  }
  return missing.length;
}
