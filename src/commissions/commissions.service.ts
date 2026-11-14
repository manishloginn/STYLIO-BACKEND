import { MongoDoc } from '../common/interfaces/mongo-doc';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MappingStatus, MiddlemanStatus, RuleStatus } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { toPublic } from '../common/utils/public';
import { SalonAccessService } from '../salons/salon-access.service';
import { giveApprovedSalonsPlatformDefault, resolveCommissionRates } from './commission-rates';
import { CreateRuleDto } from './commissions.dto';

@Injectable()
export class CommissionsService {
  constructor(
    @InjectModel('Commission') private readonly commissions: Model<MongoDoc>,
    @InjectModel('CommissionRule') private readonly rules: Model<MongoDoc>,
    @InjectModel('Salon') private readonly salons: Model<MongoDoc>,
    @InjectModel('Middleman') private readonly middlemen: Model<MongoDoc>,
    @InjectModel('MiddlemanSalonMapping') private readonly mappings: Model<MongoDoc>,
    @InjectModel('AuditLog') private readonly audits: Model<MongoDoc>,
    private readonly access: SalonAccessService,
  ) {}

  async forSalon(user: AuthUser, salonId: string) {
    await this.access.assert(user, salonId, 'sales:read');
    const rows = await this.commissions.find({ salonId }).sort({ createdAt: -1 }).lean();
    const summary = rows.reduce(
      (acc, row) => {
        acc.commissionPaise += row.commissionPaise - row.reversedPaise;
        acc.salonPayablePaise += row.salonPayablePaise;
        return acc;
      },
      { commissionPaise: 0, salonPayablePaise: 0, count: rows.length },
    );
    return { summary, items: rows.map((row) => toPublic(row)) };
  }

  async listRules() {
    await giveApprovedSalonsPlatformDefault(this.rules, this.salons, this.audits);
    const rows = await this.rules.find().sort({ createdAt: -1 }).lean();
    return this.withMiddlemen(rows);
  }

  async listRecent() {
    const rows = await this.commissions.find().sort({ createdAt: -1 }).limit(50).lean();
    await this.fillMissingSplits(rows);
    const salonIds = [...new Set(rows.map((row) => row.salonId).filter(Boolean))];
    const salons = await this.salons.find({ _id: { $in: salonIds } }).select('name city').lean();
    const byId = new Map(salons.map((salon) => [salon._id, salon]));
    const listed = await this.withMiddlemen(rows);
    return listed.map((row) => {
      const salon = byId.get(row.salonId);
      return {
        ...row,
        salon: salon ? { id: salon._id, name: salon.name, city: salon.city } : null,
      };
    });
  }

  async createRule(actor: AuthUser, dto: CreateRuleDto) {
    let rates: ReturnType<typeof resolveCommissionRates>;
    try {
      rates = resolveCommissionRates(dto);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Set a valid commission rate');
    }
    const salonId = dto.salonId || null;
    const linksPerson = dto.baseRateBps != null || dto.middlemanRateBps != null || dto.middlemanId != null;
    const middlemanId = salonId && linksPerson && rates.middlemanRateBps > 0
      ? await this.requireActiveMiddleman(dto.middlemanId)
      : null;
    if (salonId && middlemanId) await this.assertSalonAvailable(salonId, middlemanId);
    await this.rules.updateMany(
      { salonId, status: RuleStatus.ACTIVE },
      { $set: { status: RuleStatus.INACTIVE, effectiveTo: new Date(dto.effectiveFrom) } },
    );
    const rule = await this.rules.create({
      salonId,
      middlemanId,
      baseRateBps: rates.baseRateBps,
      middlemanRateBps: rates.middlemanRateBps,
      rateBps: rates.rateBps,
      effectiveFrom: new Date(dto.effectiveFrom),
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      status: RuleStatus.ACTIVE,
      createdBy: actor.sub,
    });
    if (salonId && linksPerson) await this.linkMiddleman(actor.sub, salonId, middlemanId, rates.middlemanRateBps);
    await this.audits.create({
      actorId: actor.sub,
      action: 'COMMISSION_RULE_CREATED',
      entityType: 'commission_rule',
      entityId: rule._id,
      metadata: { salonId, middlemanId, ...rates },
    });
    if (!salonId) await giveApprovedSalonsPlatformDefault(this.rules, this.salons, this.audits);
    const [saved] = await this.withMiddlemen([rule]);
    return saved;
  }

  private async fillMissingSplits(rows: MongoDoc[]) {
    const incomplete = rows.filter((row) => row.baseRateBps == null || row.middlemanRateBps == null || !row.middlemanId);
    if (!incomplete.length) return;
    const ruleIds = [...new Set(incomplete.map((row) => row.ruleId).filter(Boolean))];
    const salonIds = [...new Set(incomplete.map((row) => row.salonId).filter(Boolean))];
    const [usedRules, activeRules] = await Promise.all([
      this.rules.find({ _id: { $in: ruleIds } }).select('rateBps baseRateBps middlemanRateBps middlemanId').lean(),
      this.rules.find({ salonId: { $in: salonIds }, status: RuleStatus.ACTIVE }).select('salonId rateBps baseRateBps middlemanRateBps middlemanId').lean(),
    ]);
    const used = new Map(usedRules.map((rule) => [String(rule._id), rule]));
    const active = new Map(activeRules.map((rule) => [String(rule.salonId), rule]));
    for (const row of incomplete) {
      const rule = used.get(String(row.ruleId));
      const patch: Record<string, unknown> = {};
      if ((row.baseRateBps == null || row.middlemanRateBps == null) && rule && rule.rateBps === row.rateBps) {
        const base = rule.baseRateBps ?? row.rateBps;
        const middle = rule.middlemanRateBps ?? 0;
        if (base + middle === row.rateBps) {
          if (row.baseRateBps == null) {
            row.baseRateBps = base;
            patch.baseRateBps = base;
          }
          if (row.middlemanRateBps == null) {
            row.middlemanRateBps = middle;
            patch.middlemanRateBps = middle;
          }
        }
      }
      const current = active.get(String(row.salonId));
      const sameSplit = Boolean(
        current
        && current.rateBps === row.rateBps
        && (current.baseRateBps ?? current.rateBps) === row.baseRateBps
        && (current.middlemanRateBps ?? 0) === row.middlemanRateBps,
      );
      if (!row.middlemanId && row.middlemanRateBps > 0 && sameSplit && current?.middlemanId) {
        row.middlemanId = current.middlemanId;
        patch.middlemanId = current.middlemanId;
      }
      if (Object.keys(patch).length) await this.commissions.updateOne({ _id: row._id }, { $set: patch });
    }
  }

  private async assertSalonAvailable(salonId: string, middlemanId: string) {
    const current = await this.mappings.findOne({ salonId, status: MappingStatus.ACTIVE }).lean();
    if (!current || current.middlemanId === middlemanId) return;
    const [salon, owner] = await Promise.all([
      this.salons.findById(salonId).select('name').lean(),
      this.middlemen.findById(current.middlemanId).select('name').lean(),
    ]);
    throw new BadRequestException(
      `${salon?.name || 'This salon'} already has ${owner?.name || 'a middleman'}. One salon can have only one middleman.`,
    );
  }

  private async requireActiveMiddleman(middlemanId?: string) {
    if (!middlemanId) throw new BadRequestException('Choose the middleman who receives this salon rate');
    const person = await this.middlemen.findById(middlemanId).lean();
    if (!person) throw new NotFoundException('Middleman not found');
    if (person.status !== MiddlemanStatus.ACTIVE) {
      throw new BadRequestException('Activate this middleman before linking the salon');
    }
    return String(person._id);
  }

  private async linkMiddleman(actorId: string, salonId: string, middlemanId: string | null, middlemanRateBps: number) {
    const now = new Date();
    const current = await this.mappings.findOne({ salonId, status: MappingStatus.ACTIVE });
    const sameLink = Boolean(
      current && middlemanId && current.middlemanId === middlemanId && current.agreedRateBps === middlemanRateBps,
    );
    if (sameLink) return;
    if (current && middlemanId && current.middlemanId !== middlemanId) {
      await this.assertSalonAvailable(salonId, middlemanId);
    }
    if (current) {
      current.status = MappingStatus.ENDED;
      current.effectiveTo = now;
      current.endedBy = actorId;
      await current.save();
    }
    if (!middlemanId || middlemanRateBps <= 0) return;
    await this.mappings.create({
      middlemanId,
      salonId,
      agreedRateBps: middlemanRateBps,
      status: MappingStatus.ACTIVE,
      effectiveFrom: now,
      createdBy: actorId,
    });
  }

  private async withMiddlemen(rows: MongoDoc[]) {
    const ids = [...new Set(rows.map((row) => row.middlemanId).filter(Boolean))];
    const people = ids.length
      ? await this.middlemen.find({ _id: { $in: ids } }).select('name phone').lean()
      : [];
    const byId = new Map(people.map((person) => [String(person._id), person]));
    return rows.map((row) => {
      const person = row.middlemanId ? byId.get(String(row.middlemanId)) : undefined;
      return {
        ...toPublic(row),
        middleman: person ? { id: String(person._id), name: person.name, phone: person.phone } : null,
      };
    });
  }
}
