import { MongoDoc } from '../common/interfaces/mongo-doc';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import {
  BranchStatus,
  ChallengeStatus,
  EntitlementType,
  LedgerEntryType,
  MembershipStatus,
  PlanType,
  RedemptionStatus,
  Role,
} from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { withTransaction } from '../common/transaction';
import { sha256, sixDigitCode } from '../common/utils/hash';
import { toPublic } from '../common/utils/public';
import { quoteRedemption } from '../entitlements/entitlement.engine';
import { SalonAccessService } from '../salons/salon-access.service';
import { CreateChallengeDto, VerifyRedemptionDto } from './redemptions.dto';

const OTP_MS = 3 * 60 * 1000;

@Injectable()
export class RedemptionsService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel('Membership') private readonly memberships: Model<MongoDoc>,
    @InjectModel('MembershipEntitlement') private readonly entitlements: Model<MongoDoc>,
    @InjectModel('EntitlementLedger') private readonly ledger: Model<MongoDoc>,
    @InjectModel('RedemptionChallenge') private readonly challenges: Model<MongoDoc>,
    @InjectModel('Redemption') private readonly redemptions: Model<MongoDoc>,
    @InjectModel('Branch') private readonly branches: Model<MongoDoc>,
    @InjectModel('SalonService') private readonly services: Model<MongoDoc>,
    @InjectModel('User') private readonly users: Model<MongoDoc>,
    @InjectModel('MembershipEvent') private readonly events: Model<MongoDoc>,
    @InjectModel('Notification') private readonly notifications: Model<MongoDoc>,
    private readonly access: SalonAccessService,
    private readonly config: ConfigService,
  ) {}

  async createChallenge(user: AuthUser, dto: CreateChallengeDto) {
    const membership = await this.memberships.findById(dto.membershipId);
    if (!membership) throw new NotFoundException('Membership not found');
    if (membership.userId !== user.sub) {
      throw new ForbiddenException('This pass belongs to another customer');
    }
    this.assertUsable(membership);
    const context = await this.contextFor(membership, dto.serviceId);
    quoteRedemption(context.quoteInput);
    const code = sixDigitCode();
    const challenge = await withTransaction(this.connection, async (session) => {
      await this.challenges.updateMany(
        { membershipId: membership._id, status: ChallengeStatus.ACTIVE },
        { $set: { status: ChallengeStatus.CANCELLED } },
        { session },
      );
      const [created] = await this.challenges.create(
        [
          {
            membershipId: membership._id,
            serviceId: dto.serviceId,
            codeHash: this.hashCode(code),
            expiresAt: new Date(Date.now() + OTP_MS),
            status: ChallengeStatus.ACTIVE,
          },
        ],
        { session },
      );
      return created;
    });
    return {
      challengeId: challenge._id,
      code,
      expiresAt: challenge.expiresAt,
      serviceId: dto.serviceId,
      serviceName: context.service.name,
      membershipId: membership._id,
    };
  }

  async verify(user: AuthUser, dto: VerifyRedemptionDto) {
    const challenge = await this.challenges.findOne({
      codeHash: this.hashCode(dto.code),
      status: ChallengeStatus.ACTIVE,
    });
    if (!challenge || challenge.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('OTP is invalid or expired');
    }
    const membership = await this.memberships.findById(challenge.membershipId);
    if (!membership) throw new NotFoundException('Membership not found');
    await this.access.assert(user, membership.salonId, 'redemptions:verify');
    const branch = await this.branches.findById(dto.branchId).lean();
    if (!branch || branch.salonId !== membership.salonId || branch.status !== BranchStatus.VERIFIED) {
      throw new BadRequestException('This branch cannot redeem the membership');
    }
    const allowed: string[] = membership.planSnapshot?.branchIds ?? [];
    if (allowed.length > 0 && !allowed.includes(branch._id)) {
      throw new BadRequestException('This membership is not valid at this branch');
    }
    const result = await withTransaction(this.connection, async (session) => {
      const freshMembership = await this.memberships.findById(membership._id).session(session);
      const freshChallenge = await this.challenges.findById(challenge._id).session(session);
      if (!freshMembership || !freshChallenge || freshChallenge.status !== ChallengeStatus.ACTIVE) {
        throw new BadRequestException('OTP is invalid or expired');
      }
      if (freshChallenge.expiresAt.getTime() < Date.now()) {
        freshChallenge.status = ChallengeStatus.EXPIRED;
        await freshChallenge.save({ session });
        throw new BadRequestException('OTP is invalid or expired');
      }
      this.assertUsable(freshMembership);
      const context = await this.contextFor(freshMembership, freshChallenge.serviceId, session);
      const quote = quoteRedemption(context.quoteInput);
      const [redemption] = await this.redemptions.create(
        [
          {
            membershipId: freshMembership._id,
            salonId: freshMembership.salonId,
            branchId: branch._id,
            serviceId: freshChallenge.serviceId,
            verifiedBy: user.sub,
            serviceQuantity: 1,
            retailPriceSnapshot: quote.retailPrice,
            entitlementDeduction: quote.entitlementDeduction,
            discountAmount: quote.discountAmount,
            customerPayable: quote.customerPayable,
            status: RedemptionStatus.COMPLETED,
            idempotencyKey: `redeem:${freshChallenge._id}`,
            challengeId: freshChallenge._id,
            redeemedAt: new Date(),
          },
        ],
        { session },
      );
      if (quote.valueDelta > 0 && context.valueEntitlement) {
        const updated = await this.entitlements.findOneAndUpdate(
          {
            _id: context.valueEntitlement._id,
            $expr: {
              $gte: [{ $subtract: ['$totalValue', '$consumedValue'] }, quote.valueDelta],
            },
          },
          { $inc: { consumedValue: quote.valueDelta } },
          { session, new: true },
        );
        if (!updated) throw new BadRequestException('Not enough service value left on this membership');
        await this.ledger.create(
          [
            {
              membershipId: freshMembership._id,
              entitlementId: context.valueEntitlement._id,
              redemptionId: redemption._id,
              entryType: LedgerEntryType.CONSUME,
              valueDelta: quote.valueDelta,
              quantityDelta: 0,
              idempotencyKey: `redeem:${freshChallenge._id}:value`,
            },
          ],
          { session },
        );
      }
      if (quote.quantityDelta > 0 && context.quantityEntitlement) {
        const updated = await this.entitlements.findOneAndUpdate(
          {
            _id: context.quantityEntitlement._id,
            $expr: {
              $gte: [{ $subtract: ['$totalQuantity', '$consumedQuantity'] }, quote.quantityDelta],
            },
          },
          { $inc: { consumedQuantity: quote.quantityDelta } },
          { session, new: true },
        );
        if (!updated) throw new BadRequestException('No remaining quantity for this service');
        await this.ledger.create(
          [
            {
              membershipId: freshMembership._id,
              entitlementId: context.quantityEntitlement._id,
              redemptionId: redemption._id,
              entryType: LedgerEntryType.CONSUME,
              valueDelta: 0,
              quantityDelta: quote.quantityDelta,
              idempotencyKey: `redeem:${freshChallenge._id}:qty`,
            },
          ],
          { session },
        );
      }
      freshChallenge.status = ChallengeStatus.USED;
      await freshChallenge.save({ session });
      await this.refreshStatus(freshMembership, session);
      await this.events.create(
        [
          {
            membershipId: freshMembership._id,
            type: 'REDEEMED',
            actorId: user.sub,
            metadata: { redemptionId: redemption._id, serviceId: freshChallenge.serviceId },
          },
        ],
        { session },
      );
      return redemption;
    });
    await this.notifications.create({
      userId: membership.userId,
      title: 'Service checked off',
      body: `${result.serviceId} was redeemed at the salon.`,
    });
    return toPublic(result);
  }

  async reverse(user: AuthUser, redemptionId: string) {
    const redemption = await this.redemptions.findById(redemptionId);
    if (!redemption) throw new NotFoundException('Redemption not found');
    if (user.role !== Role.PLATFORM_ADMIN) {
      await this.access.assert(user, redemption.salonId, 'redemptions:verify');
    }
    if (redemption.status !== RedemptionStatus.COMPLETED) {
      throw new BadRequestException('Only a completed redemption can be reversed');
    }
    await withTransaction(this.connection, async (session) => {
      const fresh = await this.redemptions.findById(redemptionId).session(session);
      if (!fresh || fresh.status !== RedemptionStatus.COMPLETED) {
        throw new BadRequestException('Only a completed redemption can be reversed');
      }
      const rows = await this.ledger.find({ redemptionId, entryType: LedgerEntryType.CONSUME }).session(session);
      for (const row of rows) {
        const entitlement = await this.entitlements.findById(row.entitlementId).session(session);
        if (!entitlement) continue;
        if (row.valueDelta > 0 && entitlement.consumedValue < row.valueDelta) {
          throw new BadRequestException('Entitlement projection cannot be reversed');
        }
        if (row.quantityDelta > 0 && entitlement.consumedQuantity < row.quantityDelta) {
          throw new BadRequestException('Entitlement projection cannot be reversed');
        }
        entitlement.consumedValue -= row.valueDelta;
        entitlement.consumedQuantity -= row.quantityDelta;
        await entitlement.save({ session });
        await this.ledger.create(
          [
            {
              membershipId: fresh.membershipId,
              entitlementId: row.entitlementId,
              redemptionId: fresh._id,
              entryType: LedgerEntryType.REVERSE,
              valueDelta: -row.valueDelta,
              quantityDelta: -row.quantityDelta,
              idempotencyKey: `reverse:${fresh._id}:${row.entitlementId}`,
            },
          ],
          { session },
        );
      }
      fresh.status = RedemptionStatus.REVERSED;
      await fresh.save({ session });
      const membership = await this.memberships.findById(fresh.membershipId).session(session);
      if (membership && membership.status === MembershipStatus.EXHAUSTED) {
        membership.status = MembershipStatus.ACTIVE;
        await membership.save({ session });
      }
      await this.events.create(
        [
          {
            membershipId: fresh.membershipId,
            type: 'REVERSED',
            actorId: user.sub,
            metadata: { redemptionId: fresh._id },
          },
        ],
        { session },
      );
    });
    const updated = await this.redemptions.findById(redemptionId).lean();
    return toPublic(updated);
  }

  async mine(user: AuthUser) {
    const memberships = await this.memberships.find({ userId: user.sub }).select('_id').lean();
    const rows = await this.redemptions
      .find({ membershipId: { $in: memberships.map((row) => row._id) } })
      .sort({ redeemedAt: -1 })
      .lean();
    return this.withNames(rows);
  }

  async forSalon(user: AuthUser, salonId: string) {
    await this.access.assert(user, salonId, 'redemptions:verify');
    const rows = await this.redemptions.find({ salonId }).sort({ redeemedAt: -1 }).limit(100).lean();
    return this.withNames(rows);
  }

  async adminList() {
    const rows = await this.redemptions.find().sort({ redeemedAt: -1 }).limit(100).lean();
    return this.withNames(rows);
  }

  private hashCode(code: string) {
    return sha256(`${code}:${this.config.getOrThrow<string>('OTP_PEPPER')}`);
  }

  private assertUsable(membership: any) {
    if (membership.status === MembershipStatus.CANCELLED) {
      throw new BadRequestException('This membership is cancelled');
    }
    if (membership.status === MembershipStatus.EXHAUSTED) {
      throw new BadRequestException('This membership has no remaining services');
    }
    if (membership.status === MembershipStatus.EXPIRED || new Date(membership.expiresAt).getTime() < Date.now()) {
      throw new BadRequestException('This membership has expired');
    }
    if (membership.status !== MembershipStatus.ACTIVE) {
      throw new BadRequestException('This membership cannot be used');
    }
  }

  private async contextFor(membership: any, serviceId: string, session?: any) {
    const serviceQuery = this.services.findById(serviceId);
    if (session) serviceQuery.session(session);
    const service = await serviceQuery.lean();
    if (!service || service.salonId !== membership.salonId) {
      throw new BadRequestException('This service is not eligible');
    }
    const snapshotItem = (membership.planSnapshot?.items ?? []).find(
      (item: { serviceId: string }) => item.serviceId === serviceId,
    );
    const entQuery = this.entitlements.find({ membershipId: membership._id });
    if (session) entQuery.session(session);
    const entitlements = await entQuery.lean();
    const valueEntitlement = entitlements.find(
      (ent) => ent.entitlementType === EntitlementType.VALUE && !ent.serviceId,
    );
    const quantityEntitlement = entitlements.find(
      (ent) => ent.entitlementType === EntitlementType.QUANTITY && ent.serviceId === serviceId,
    );
    const planType = membership.planTypeSnapshot as PlanType;
    return {
      service,
      valueEntitlement,
      quantityEntitlement,
      quoteInput: {
        planType,
        item: snapshotItem ?? null,
        retailPrice: service.retailPrice,
        valueRemaining: valueEntitlement ? valueEntitlement.totalValue - valueEntitlement.consumedValue : null,
        quantityRemaining: quantityEntitlement
          ? quantityEntitlement.totalQuantity - quantityEntitlement.consumedQuantity
          : null,
        discountPercentage: membership.planSnapshot?.discountPercentage ?? null,
        discountCapRemaining:
          planType === PlanType.DISCOUNT
            ? valueEntitlement
              ? valueEntitlement.totalValue - valueEntitlement.consumedValue
              : null
            : null,
      },
    };
  }

  private async refreshStatus(membership: any, session: any) {
    const entitlements = await this.entitlements.find({ membershipId: membership._id }).session(session);
    const planType = membership.planTypeSnapshot as PlanType;
    const quantities = entitlements.filter((ent: any) => ent.entitlementType === EntitlementType.QUANTITY);
    const value = entitlements.find((ent: any) => ent.entitlementType === EntitlementType.VALUE && !ent.serviceId);
    const quantitiesDone = quantities.length > 0 && quantities.every((ent: any) => ent.consumedQuantity >= ent.totalQuantity);
    const valueDone = !!value && value.consumedValue >= value.totalValue;
    const exhausted =
      (planType === PlanType.SERVICE && quantitiesDone) ||
      (planType === PlanType.VALUE && valueDone) ||
      (planType === PlanType.BOTH && quantitiesDone && valueDone);
    if (exhausted) {
      membership.status = MembershipStatus.EXHAUSTED;
      await membership.save({ session });
    }
  }

  private async withNames(rows: any[]) {
    const serviceIds = [...new Set(rows.map((row) => row.serviceId).filter(Boolean))];
    const membershipIds = [...new Set(rows.map((row) => row.membershipId).filter(Boolean))];
    const [services, memberships] = await Promise.all([
      this.services.find({ _id: { $in: serviceIds } }).select('name').lean(),
      this.memberships.find({ _id: { $in: membershipIds } }).select('userId planSnapshot').lean(),
    ]);
    const userIds = [...new Set(memberships.map((row) => row.userId).filter(Boolean))];
    const users = await this.users.find({ _id: { $in: userIds } }).select('name phone').lean();
    const serviceNames = new Map(services.map((service) => [service._id, service.name]));
    const membershipById = new Map(memberships.map((row) => [row._id, row]));
    const userById = new Map(users.map((user) => [user._id, user]));
    return rows.map((row) => {
      const membership = membershipById.get(row.membershipId);
      const customer = membership ? userById.get(membership.userId) : undefined;
      return {
        ...toPublic(row),
        serviceName: serviceNames.get(row.serviceId) ?? 'Service',
        planName: membership?.planSnapshot?.name ?? null,
        customer: customer ? { id: customer._id, name: customer.name, phone: customer.phone } : null,
      };
    });
  }
}
