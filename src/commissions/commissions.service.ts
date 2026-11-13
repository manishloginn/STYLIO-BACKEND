import { MongoDoc } from '../common/interfaces/mongo-doc';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RuleStatus } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { toPublic } from '../common/utils/public';
import { SalonAccessService } from '../salons/salon-access.service';
import { CreateRuleDto } from './commissions.dto';

@Injectable()
export class CommissionsService {
  constructor(
    @InjectModel('Commission') private readonly commissions: Model<MongoDoc>,
    @InjectModel('CommissionRule') private readonly rules: Model<MongoDoc>,
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
    const rows = await this.rules.find().sort({ createdAt: -1 }).lean();
    return rows.map((row) => toPublic(row));
  }

  async createRule(actor: AuthUser, dto: CreateRuleDto) {
    const salonId = dto.salonId || null;
    await this.rules.updateMany(
      { salonId, status: RuleStatus.ACTIVE },
      { $set: { status: RuleStatus.INACTIVE, effectiveTo: new Date(dto.effectiveFrom) } },
    );
    const rule = await this.rules.create({
      salonId,
      rateBps: dto.rateBps,
      effectiveFrom: new Date(dto.effectiveFrom),
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      status: RuleStatus.ACTIVE,
      createdBy: actor.sub,
    });
    await this.audits.create({
      actorId: actor.sub,
      action: 'COMMISSION_RULE_CREATED',
      entityType: 'commission_rule',
      entityId: rule._id,
      metadata: { salonId, rateBps: dto.rateBps },
    });
    return toPublic(rule);
  }
}
