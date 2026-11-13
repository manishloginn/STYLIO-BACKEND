import { MongoDoc } from '../common/interfaces/mongo-doc';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model } from 'mongoose';
import {
  AttributionSource,
  MembershipStatus,
  PaymentStatus,
  PlanStatus,
  RuleStatus,
} from '../common/enums';
import { withTransaction } from '../common/transaction';
import { percentPaise } from '../common/utils/money';
import { toPublic } from '../common/utils/public';
import { entitlementDrafts, PlanItemShape } from '../entitlements/entitlement.engine';
import { MiddlemenService } from '../middlemen/middlemen.service';

export interface WebhookPayment {
  gatewayOrderId: string;
  gatewayPaymentId: string;
  amount: number;
  status: 'PAID' | 'FAILED';
}

@Injectable()
export class ActivationService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel('Payment') private readonly payments: Model<MongoDoc>,
    @InjectModel('MembershipPlan') private readonly plans: Model<MongoDoc>,
    @InjectModel('MembershipPlanItem') private readonly items: Model<MongoDoc>,
    @InjectModel('MembershipPlanBranch') private readonly planBranches: Model<MongoDoc>,
    @InjectModel('Membership') private readonly memberships: Model<MongoDoc>,
    @InjectModel('MembershipEntitlement') private readonly entitlements: Model<MongoDoc>,
    @InjectModel('AttributionRecord') private readonly attributions: Model<MongoDoc>,
    @InjectModel('CommissionRule') private readonly rules: Model<MongoDoc>,
    @InjectModel('Commission') private readonly commissions: Model<MongoDoc>,
    @InjectModel('MembershipEvent') private readonly events: Model<MongoDoc>,
    @InjectModel('Notification') private readonly notifications: Model<MongoDoc>,
    private readonly middlemen: MiddlemenService,
  ) {}

  async applyWebhook(input: WebhookPayment) {
    try {
      return await withTransaction(this.connection, (session) => this.apply(input, session));
    } catch (error) {
      const existing = await this.payments.findOne({ gatewayOrderId: input.gatewayOrderId }).lean();
      if (existing?.status === PaymentStatus.PAID) {
        const membership = await this.memberships.findById(existing.membershipId).lean();
        return { payment: toPublic(existing), membership: toPublic(membership), duplicate: true };
      }
      throw error;
    }
  }

  async recordDirect(input: {
    userId: string;
    planId: string;
    idempotencyKey: string;
    actorId: string;
  }) {
    let payment = await this.payments.findOne({ idempotencyKey: input.idempotencyKey });
    if (payment?.status === PaymentStatus.PAID) {
      const membership = await this.memberships.findById(payment.membershipId).lean();
      return { payment: toPublic(payment), membership: toPublic(membership), duplicate: true };
    }
    const loaded = await this.loadPlan(input.planId);
    if (!payment) {
      payment = await this.payments.create({
        userId: input.userId,
        salonId: loaded.plan.salonId,
        planId: input.planId,
        gateway: 'DIRECT',
        gatewayOrderId: `direct_${input.idempotencyKey}`,
        amount: loaded.plan.sellingPrice,
        currency: 'INR',
        status: PaymentStatus.PENDING,
        idempotencyKey: input.idempotencyKey,
      });
    }
    return this.apply(
      {
        gatewayOrderId: payment.gatewayOrderId,
        gatewayPaymentId: `direct_pay_${input.idempotencyKey}`,
        amount: payment.amount,
        status: 'PAID',
      },
      undefined,
      AttributionSource.DIRECT,
    );
  }

  private async apply(input: WebhookPayment, session?: ClientSession, source = AttributionSource.STYLIO) {
    const run = async (active: ClientSession) => {
      const payment = await this.payments.findOne({ gatewayOrderId: input.gatewayOrderId }).session(active);
      if (!payment) throw new NotFoundException('Payment not found');
      if (payment.amount !== input.amount) {
        throw new BadRequestException('Payment amount does not match the order');
      }
      if (payment.status === PaymentStatus.PAID) {
        const membership = await this.memberships.findById(payment.membershipId).session(active);
        return { payment: toPublic(payment), membership: toPublic(membership), duplicate: true };
      }
      if (input.status === 'FAILED') {
        if (payment.status === PaymentStatus.PENDING) {
          payment.status = PaymentStatus.FAILED;
          payment.gatewayPaymentId = input.gatewayPaymentId;
          await payment.save({ session: active });
        }
        return { payment: toPublic(payment), membership: null, duplicate: false };
      }
      if (payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.FAILED) {
        throw new BadRequestException('Payment cannot be completed');
      }
      const { plan, items, branches } = await this.loadPlan(payment.planId, active);
      const now = new Date();
      const snapshot = {
        planId: plan._id,
        name: plan.name,
        description: plan.description,
        planType: plan.planType,
        planSource: plan.planSource,
        sellingPrice: plan.sellingPrice,
        validityDays: plan.validityDays,
        serviceValueLimit: plan.serviceValueLimit ?? null,
        discountPercentage: plan.discountPercentage ?? null,
        discountCap: plan.discountCap ?? null,
        stackingAllowed: plan.stackingAllowed,
        terms: plan.terms,
        restrictions: plan.restrictions,
        items: items.map((item) => ({
          serviceId: item.serviceId,
          quantityLimit: item.quantityLimit ?? null,
          valueDeduction: item.valueDeduction ?? null,
          excluded: !!item.excluded,
        })),
        branchIds: branches.map((branch) => branch.branchId),
      };
      const [membership] = await this.memberships.create(
        [
          {
            userId: payment.userId,
            salonId: plan.salonId,
            planId: plan._id,
            planSnapshot: snapshot,
            purchasePrice: payment.amount,
            planTypeSnapshot: plan.planType,
            startsAt: now,
            expiresAt: new Date(now.getTime() + plan.validityDays * 86_400_000),
            status: MembershipStatus.ACTIVE,
            source,
          },
        ],
        { session: active },
      );
      const drafts = entitlementDrafts(
        {
          planType: plan.planType,
          sellingPrice: plan.sellingPrice,
          validityDays: plan.validityDays,
          serviceValueLimit: plan.serviceValueLimit,
          discountPercentage: plan.discountPercentage,
          discountCap: plan.discountCap,
        },
        items as unknown as PlanItemShape[],
      );
      if (drafts.length) {
        await this.entitlements.insertMany(
          drafts.map((draft) => ({
            membershipId: membership._id,
            serviceId: draft.serviceId,
            entitlementType: draft.entitlementType,
            totalValue: draft.totalValue,
            consumedValue: 0,
            totalQuantity: draft.totalQuantity,
            consumedQuantity: 0,
          })),
          { session: active },
        );
      }
      await this.attributions.create(
        [
          {
            customerId: payment.userId,
            salonId: plan.salonId,
            source,
            paymentId: payment._id,
            membershipId: membership._id,
          },
        ],
        { session: active },
      );
      if (source === AttributionSource.STYLIO) {
        const rule = await this.findRule(plan.salonId, now, active);
        if (rule) {
          const commissionPaise = percentPaise(payment.amount, rule.rateBps);
          await this.commissions.create(
            [
              {
                paymentId: payment._id,
                membershipId: membership._id,
                salonId: plan.salonId,
                ruleId: rule._id,
                rateBps: rule.rateBps,
                commissionPaise,
                salonPayablePaise: payment.amount - commissionPaise,
                reversedPaise: 0,
              },
            ],
            { session: active },
          );
          await this.middlemen.recordForSale(active, {
            paymentId: payment._id,
            membershipId: membership._id,
            salonId: plan.salonId,
            amountPaise: payment.amount,
            salonRuleId: rule._id,
            salonRateBps: rule.rateBps,
            salonCommissionPaise: commissionPaise,
            at: now,
          });
        }
      }
      payment.status = PaymentStatus.PAID;
      payment.gatewayPaymentId = input.gatewayPaymentId;
      payment.membershipId = membership._id;
      payment.paidAt = now;
      await payment.save({ session: active });
      await this.events.create(
        [
          {
            membershipId: membership._id,
            type: 'PURCHASED',
            actorId: payment.userId,
            metadata: { paymentId: payment._id, source },
          },
        ],
        { session: active },
      );
      return { payment: toPublic(payment), membership: toPublic(membership), duplicate: false };
    };
    const result = session ? await run(session) : await withTransaction(this.connection, run);
    if (!result.duplicate && result.membership) {
      const userId = (result.payment as { userId?: string }).userId;
      if (userId) {
        await this.notifications.create({
          userId,
          title: 'Membership is active',
          body: 'Your salon membership pass is ready.',
        });
      }
    }
    return result;
  }

  private async loadPlan(planId: string, session?: ClientSession) {
    const planQuery = this.plans.findById(planId);
    if (session) planQuery.session(session);
    const plan = await planQuery.lean();
    if (!plan || plan.status !== PlanStatus.PUBLISHED) {
      throw new BadRequestException('This plan is not available to purchase');
    }
    const itemQuery = this.items.find({ planId });
    const branchQuery = this.planBranches.find({ planId });
    if (session) {
      itemQuery.session(session);
      branchQuery.session(session);
    }
    const [items, branches] = await Promise.all([itemQuery.lean(), branchQuery.lean()]);
    return { plan, items, branches };
  }

  private async findRule(salonId: string, at: Date, session: ClientSession) {
    const activeAt = {
      status: RuleStatus.ACTIVE,
      effectiveFrom: { $lte: at },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: at } }],
    };
    const specific = await this.rules.findOne({ ...activeAt, salonId }).session(session).lean();
    if (specific) return specific;
    return this.rules.findOne({ ...activeAt, salonId: null }).session(session).lean();
  }
}
