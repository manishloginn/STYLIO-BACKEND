import { MongoDoc } from '../common/interfaces/mongo-doc';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import {
  CommissionEntryType,
  CommissionTxnStatus,
  MappingStatus,
  MiddlemanStatus,
  PayoutStatus,
  RuleStatus,
} from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { withTransaction } from '../common/transaction';
import { normalizePhone } from '../common/utils/phone';
import { toPublic } from '../common/utils/public';
import { quoteMiddlemanRefund, quoteMiddlemanSplit } from './commission-split';
import {
  ApproveTransactionsDto,
  CreateMappingDto,
  CreateMiddlemanDto,
  CreateMiddlemanPayoutDto,
  TransactionQueryDto,
  UpdateMiddlemanDto,
} from './middlemen.dto';

export interface SaleSplitInput {
  paymentId: string;
  membershipId: string;
  salonId: string;
  amountPaise: number;
  salonRuleId: string;
  salonRateBps: number;
  salonCommissionPaise: number;
  at: Date;
}

export interface RefundSplitInput {
  paymentId: string;
  refundId: string;
  refundPaise: number;
  salonReversalPaise: number;
}

@Injectable()
export class MiddlemenService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel('Middleman') private readonly middlemen: Model<MongoDoc>,
    @InjectModel('MiddlemanSalonMapping') private readonly mappings: Model<MongoDoc>,
    @InjectModel('CommissionTransaction') private readonly ledger: Model<MongoDoc>,
    @InjectModel('MiddlemanPayout') private readonly payouts: Model<MongoDoc>,
    @InjectModel('CommissionRule') private readonly rules: Model<MongoDoc>,
    @InjectModel('Salon') private readonly salons: Model<MongoDoc>,
    @InjectModel('AuditLog') private readonly audits: Model<MongoDoc>,
  ) {}

  async list() {
    const rows = await this.middlemen.find().sort({ createdAt: -1 }).lean();
    return rows.map((row) => toPublic(row));
  }

  async detail(id: string) {
    const middleman = await this.middlemen.findById(id).lean();
    if (!middleman) throw new NotFoundException('Middleman not found');
    const [salons, transactions, payouts] = await Promise.all([
      this.mappings.find({ middlemanId: id }).sort({ createdAt: -1 }).lean(),
      this.ledger.find({ middlemanId: id }).sort({ createdAt: -1 }).limit(100).lean(),
      this.payouts.find({ middlemanId: id }).sort({ createdAt: -1 }).lean(),
    ]);
    return {
      ...toPublic(middleman),
      salons: salons.map((row) => toPublic(row)),
      transactions: transactions.map((row) => toPublic(row)),
      payouts: payouts.map((row) => toPublic(row)),
    };
  }

  async create(actor: AuthUser, dto: CreateMiddlemanDto) {
    const phone = normalizePhone(dto.phone);
    const existing = await this.middlemen.findOne({ phone }).lean();
    if (existing) throw new ConflictException('A middleman with this mobile number already exists');
    const middleman = await this.middlemen.create({
      name: dto.name.trim(),
      phone,
      ...(dto.email ? { email: dto.email.toLowerCase() } : {}),
      status: MiddlemanStatus.ACTIVE,
      defaultRateBps: dto.defaultRateBps,
      notes: dto.notes?.trim() ?? '',
      createdBy: actor.sub,
    });
    await this.audits.create({
      actorId: actor.sub,
      action: 'MIDDLEMAN_CREATED',
      entityType: 'middleman',
      entityId: middleman._id,
      metadata: { defaultRateBps: dto.defaultRateBps },
    });
    return toPublic(middleman);
  }

  async update(actor: AuthUser, id: string, dto: UpdateMiddlemanDto) {
    const middleman = await this.middlemen.findById(id);
    if (!middleman) throw new NotFoundException('Middleman not found');
    if (dto.name !== undefined) middleman.name = dto.name.trim();
    if (dto.email !== undefined) middleman.email = dto.email.toLowerCase();
    if (dto.defaultRateBps !== undefined) middleman.defaultRateBps = dto.defaultRateBps;
    if (dto.notes !== undefined) middleman.notes = dto.notes.trim();
    if (dto.status !== undefined) middleman.status = dto.status;
    await middleman.save();
    await this.audits.create({
      actorId: actor.sub,
      action: 'MIDDLEMAN_UPDATED',
      entityType: 'middleman',
      entityId: middleman._id,
      metadata: { ...dto },
    });
    return toPublic(middleman);
  }

  async mapSalon(actor: AuthUser, middlemanId: string, dto: CreateMappingDto) {
    return withTransaction(this.connection, async (session) => {
      const middleman = await this.middlemen.findById(middlemanId).session(session);
      if (!middleman) throw new NotFoundException('Middleman not found');
      if (middleman.status !== MiddlemanStatus.ACTIVE) {
        throw new BadRequestException('Activate the middleman before mapping a salon');
      }
      const salon = await this.salons.findById(dto.salonId).session(session).lean();
      if (!salon) throw new NotFoundException('Salon not found');
      const at = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
      const rule = await this.currentSalonRule(dto.salonId, at, session);
      if (!rule) {
        throw new BadRequestException('Set a salon commission rate before mapping a middleman');
      }
      if (dto.agreedRateBps > rule.rateBps) {
        throw new BadRequestException('Middleman commission cannot exceed the salon commission rate');
      }
      const current = await this.mappings
        .findOne({ salonId: dto.salonId, status: MappingStatus.ACTIVE })
        .session(session);
      if (current) {
        current.status = MappingStatus.ENDED;
        current.effectiveTo = at;
        current.endedBy = actor.sub;
        await current.save({ session });
        await this.audits.create(
          [
            {
              actorId: actor.sub,
              action: 'MIDDLEMAN_MAPPING_ENDED',
              entityType: 'middleman_mapping',
              entityId: current._id,
              metadata: { salonId: dto.salonId, middlemanId: current.middlemanId, reason: 'REASSIGNED' },
            },
          ],
          { session },
        );
      }
      const [mapping] = await this.mappings.create(
        [
          {
            middlemanId,
            salonId: dto.salonId,
            agreedRateBps: dto.agreedRateBps,
            status: MappingStatus.ACTIVE,
            effectiveFrom: at,
            createdBy: actor.sub,
          },
        ],
        { session },
      );
      await this.audits.create(
        [
          {
            actorId: actor.sub,
            action: 'MIDDLEMAN_MAPPING_CREATED',
            entityType: 'middleman_mapping',
            entityId: mapping._id,
            metadata: {
              salonId: dto.salonId,
              middlemanId,
              agreedRateBps: dto.agreedRateBps,
              salonRateBps: rule.rateBps,
            },
          },
        ],
        { session },
      );
      return toPublic(mapping);
    });
  }

  async endMapping(actor: AuthUser, mappingId: string) {
    const mapping = await this.mappings.findById(mappingId);
    if (!mapping || mapping.status !== MappingStatus.ACTIVE) {
      throw new NotFoundException('Active mapping not found');
    }
    mapping.status = MappingStatus.ENDED;
    mapping.effectiveTo = new Date();
    mapping.endedBy = actor.sub;
    await mapping.save();
    await this.audits.create({
      actorId: actor.sub,
      action: 'MIDDLEMAN_MAPPING_ENDED',
      entityType: 'middleman_mapping',
      entityId: mapping._id,
      metadata: { salonId: mapping.salonId, middlemanId: mapping.middlemanId },
    });
    return toPublic(mapping);
  }

  async salonMapping(salonId: string) {
    const mapping = await this.mappings.findOne({ salonId, status: MappingStatus.ACTIVE }).lean();
    return mapping ? toPublic(mapping) : null;
  }

  async listTransactions(query: TransactionQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {};
    if (query.middlemanId) filter.middlemanId = query.middlemanId;
    if (query.salonId) filter.salonId = query.salonId;
    if (query.status) filter.status = query.status;
    const [items, total] = await Promise.all([
      this.ledger
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.ledger.countDocuments(filter),
    ]);
    return { data: items.map((row) => toPublic(row)), meta: { page, limit, total } };
  }

  async approve(actor: AuthUser, dto: ApproveTransactionsDto) {
    const rows = await this.ledger.find({
      _id: { $in: dto.ids },
      entryType: CommissionEntryType.EARN,
      status: CommissionTxnStatus.PENDING,
    });
    if (rows.length !== dto.ids.length) {
      throw new BadRequestException('Only pending earnings can be approved');
    }
    await this.ledger.updateMany(
      { _id: { $in: dto.ids } },
      { $set: { status: CommissionTxnStatus.APPROVED } },
    );
    await this.audits.create({
      actorId: actor.sub,
      action: 'MIDDLEMAN_COMMISSION_APPROVED',
      entityType: 'commission_transaction',
      entityId: dto.ids[0],
      metadata: { ids: dto.ids },
    });
    return { approved: dto.ids.length };
  }

  async recordPayout(actor: AuthUser, dto: CreateMiddlemanPayoutDto) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodEnd <= periodStart) throw new BadRequestException('Payout period is invalid');
    return withTransaction(this.connection, async (session) => {
      const middleman = await this.middlemen.findById(dto.middlemanId).session(session).lean();
      if (!middleman) throw new NotFoundException('Middleman not found');
      const earns = await this.ledger
        .find({
          middlemanId: dto.middlemanId,
          entryType: CommissionEntryType.EARN,
          status: CommissionTxnStatus.APPROVED,
          payoutId: null,
        })
        .session(session);
      const adjusts = await this.ledger
        .find({
          middlemanId: dto.middlemanId,
          entryType: CommissionEntryType.ADJUST,
          payoutId: null,
          settledWithEarn: false,
        })
        .session(session);
      if (!earns.length && !adjusts.length) {
        throw new BadRequestException('Nothing is waiting for a middleman payout');
      }
      const earned = earns.reduce(
        (sum, row) => sum + row.middlemanCommissionPaise - row.middlemanReversedPaise,
        0,
      );
      const clawed = adjusts.reduce((sum, row) => sum + row.middlemanCommissionPaise, 0);
      const amountPaise = earned - clawed;
      const [payout] = await this.payouts.create(
        [
          {
            middlemanId: dto.middlemanId,
            periodStart,
            periodEnd,
            amountPaise,
            status: PayoutStatus.RECORDED,
            note: dto.note?.trim() ?? '',
            createdBy: actor.sub,
          },
        ],
        { session },
      );
      if (earns.length) {
        await this.ledger.updateMany(
          { _id: { $in: earns.map((row) => row._id) } },
          { $set: { status: CommissionTxnStatus.PAID, payoutId: payout._id } },
          { session },
        );
      }
      if (adjusts.length) {
        await this.ledger.updateMany(
          { _id: { $in: adjusts.map((row) => row._id) } },
          { $set: { payoutId: payout._id } },
          { session },
        );
      }
      await this.audits.create(
        [
          {
            actorId: actor.sub,
            action: 'MIDDLEMAN_PAYOUT_RECORDED',
            entityType: 'middleman_payout',
            entityId: payout._id,
            metadata: { middlemanId: dto.middlemanId, amountPaise },
          },
        ],
        { session },
      );
      return toPublic(payout);
    });
  }

  async audit(middlemanId: string) {
    const rows = await this.audits
      .find({
        $or: [
          { entityType: 'middleman', entityId: middlemanId },
          { 'metadata.middlemanId': middlemanId },
        ],
      })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return rows.map((row) => toPublic(row));
  }

  async recordForSale(session: ClientSession, input: SaleSplitInput) {
    const existing = await this.ledger
      .findOne({ idempotencyKey: `middleman:${input.paymentId}` })
      .session(session)
      .lean();
    if (existing) return existing;
    const mapping = await this.mappings
      .findOne({
        salonId: input.salonId,
        status: MappingStatus.ACTIVE,
        effectiveFrom: { $lte: input.at },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: input.at } }],
      })
      .session(session);
    if (!mapping) return null;
    const middleman = await this.middlemen.findById(mapping.middlemanId).session(session).lean();
    if (!middleman || middleman.status !== MiddlemanStatus.ACTIVE) {
      await this.skipSplit(session, mapping, input, 'MIDDLEMAN_INACTIVE');
      return null;
    }
    const share = quoteMiddlemanSplit({
      amountPaise: input.amountPaise,
      salonRateBps: input.salonRateBps,
      middlemanRateBps: mapping.agreedRateBps,
      salonCommissionPaise: input.salonCommissionPaise,
    });
    if (!share) {
      await this.skipSplit(session, mapping, input, 'RATE_EXCEEDS_SALON');
      return null;
    }
    const [row] = await this.ledger.create(
      [
        {
          paymentId: input.paymentId,
          membershipId: input.membershipId,
          salonId: input.salonId,
          middlemanId: mapping.middlemanId,
          entryType: CommissionEntryType.EARN,
          salonRuleId: input.salonRuleId,
          salonRateBps: input.salonRateBps,
          middlemanRateBps: mapping.agreedRateBps,
          grossPaise: input.amountPaise,
          salonCommissionPaise: input.salonCommissionPaise,
          middlemanCommissionPaise: share.middlemanCommissionPaise,
          stylioCommissionPaise: share.stylioCommissionPaise,
          middlemanReversedPaise: 0,
          stylioReversedPaise: 0,
          status: CommissionTxnStatus.PENDING,
          idempotencyKey: `middleman:${input.paymentId}`,
          settledWithEarn: false,
        },
      ],
      { session },
    );
    return row;
  }

  async adjustForRefund(session: ClientSession, input: RefundSplitInput) {
    const earn = await this.ledger
      .findOne({ paymentId: input.paymentId, entryType: CommissionEntryType.EARN })
      .session(session);
    if (!earn || input.salonReversalPaise <= 0) return null;
    const remainingMiddleman = earn.middlemanCommissionPaise - earn.middlemanReversedPaise;
    const remainingStylio = earn.stylioCommissionPaise - earn.stylioReversedPaise;
    const share = quoteMiddlemanRefund({
      refundPaise: input.refundPaise,
      middlemanRateBps: earn.middlemanRateBps,
      salonReversalPaise: input.salonReversalPaise,
      remainingMiddlemanPaise: remainingMiddleman,
      remainingStylioPaise: remainingStylio,
    });
    earn.middlemanReversedPaise += share.middlemanReversalPaise;
    earn.stylioReversedPaise += share.stylioReversalPaise;
    await earn.save({ session });
    const [adjustment] = await this.ledger.create(
      [
        {
          paymentId: input.paymentId,
          membershipId: earn.membershipId,
          salonId: earn.salonId,
          middlemanId: earn.middlemanId,
          entryType: CommissionEntryType.ADJUST,
          salonRuleId: earn.salonRuleId,
          salonRateBps: earn.salonRateBps,
          middlemanRateBps: earn.middlemanRateBps,
          grossPaise: input.refundPaise,
          salonCommissionPaise: input.salonReversalPaise,
          middlemanCommissionPaise: share.middlemanReversalPaise,
          stylioCommissionPaise: share.stylioReversalPaise,
          middlemanReversedPaise: 0,
          stylioReversedPaise: 0,
          status: CommissionTxnStatus.POSTED,
          idempotencyKey: `middleman-adjust:${input.refundId}`,
          relatedTransactionId: earn._id,
          settledWithEarn: !earn.payoutId,
        },
      ],
      { session },
    );
    return adjustment;
  }

  private async skipSplit(session: ClientSession, mapping: MongoDoc, input: SaleSplitInput, reason: string) {
    await this.audits.create(
      [
        {
          actorId: 'system',
          action: 'MIDDLEMAN_SPLIT_SKIPPED',
          entityType: 'middleman_mapping',
          entityId: mapping._id,
          metadata: {
            reason,
            paymentId: input.paymentId,
            salonId: input.salonId,
            middlemanId: mapping.middlemanId,
            agreedRateBps: mapping.agreedRateBps,
            salonRateBps: input.salonRateBps,
          },
        },
      ],
      { session },
    );
  }

  private async currentSalonRule(salonId: string, at: Date, session: ClientSession) {
    const window = {
      status: RuleStatus.ACTIVE,
      effectiveFrom: { $lte: at },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: at } }],
    };
    const specific = await this.rules.findOne({ ...window, salonId }).session(session).lean();
    if (specific) return specific;
    return this.rules.findOne({ ...window, salonId: null }).session(session).lean();
  }
}
