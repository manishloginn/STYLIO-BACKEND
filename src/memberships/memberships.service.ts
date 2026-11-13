import { MongoDoc } from '../common/interfaces/mongo-doc';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { pageArgs, PageQueryDto } from '../common/dto/page-query.dto';
import { EntitlementType, MembershipStatus, Role } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { normalizePhone } from '../common/utils/phone';
import { toPublic } from '../common/utils/public';
import { SalonAccessService } from '../salons/salon-access.service';
import { DirectSaleDto } from '../payments/payments.dto';
import { ActivationService } from './activation.service';

@Injectable()
export class MembershipsService {
  constructor(
    @InjectModel('Membership') private readonly memberships: Model<MongoDoc>,
    @InjectModel('MembershipPlan') private readonly plans: Model<MongoDoc>,
    @InjectModel('MembershipEntitlement') private readonly entitlements: Model<MongoDoc>,
    @InjectModel('SalonService') private readonly services: Model<MongoDoc>,
    @InjectModel('User') private readonly users: Model<MongoDoc>,
    @InjectModel('Salon') private readonly salons: Model<MongoDoc>,
    private readonly access: SalonAccessService,
    private readonly activation: ActivationService,
  ) {}

  async mine(user: AuthUser, query: PageQueryDto) {
    const { page, limit, skip } = pageArgs(query);
    const filter: Record<string, unknown> = { userId: user.sub };
    if (query.status) filter.status = query.status;
    const [rows, total] = await Promise.all([
      this.memberships.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.memberships.countDocuments(filter),
    ]);
    const data = await Promise.all(rows.map((row) => this.present(row, false)));
    return { data, meta: { page, limit, total } };
  }

  async one(user: AuthUser, id: string) {
    const membership = await this.memberships.findById(id).lean();
    if (!membership) throw new NotFoundException('Membership not found');
    if (membership.userId !== user.sub && user.role !== Role.PLATFORM_ADMIN) {
      try {
        await this.access.assert(user, membership.salonId, 'memberships:read');
      } catch {
        throw new ForbiddenException('You cannot view this membership');
      }
    }
    return this.present(membership, true);
  }

  async forSalon(user: AuthUser, salonId: string, query: PageQueryDto) {
    await this.access.assert(user, salonId, 'memberships:read');
    const { page, limit, skip } = pageArgs(query);
    const filter: Record<string, unknown> = { salonId };
    if (query.status) filter.status = query.status;
    const [rows, total] = await Promise.all([
      this.memberships.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.memberships.countDocuments(filter),
    ]);
    return { data: await this.withCustomers(rows), meta: { page, limit, total } };
  }

  async direct(user: AuthUser, dto: DirectSaleDto) {
    const plan = await this.plans.findById(dto.planId).lean();
    if (!plan) throw new NotFoundException('Plan not found');
    await this.access.assert(user, plan.salonId, 'sales:write');
    const phone = normalizePhone(dto.customerPhone);
    const customer = await this.users.findOne({ phone }).lean();
    if (!customer) throw new NotFoundException('No customer account uses that mobile number');
    return this.activation.recordDirect({
      userId: customer._id,
      planId: dto.planId,
      idempotencyKey: dto.idempotencyKey,
      actorId: user.sub,
    });
  }

  async adminList(query: PageQueryDto) {
    const { page, limit, skip } = pageArgs(query);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    const [rows, total] = await Promise.all([
      this.memberships.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.memberships.countDocuments(filter),
    ]);
    return { data: await this.withCustomers(rows), meta: { page, limit, total } };
  }

  private async withCustomers(rows: any[]) {
    const userIds = [...new Set(rows.map((row) => row.userId).filter(Boolean))];
    const users = await this.users.find({ _id: { $in: userIds } }).select('name phone').lean();
    const byId = new Map(users.map((user) => [user._id, user]));
    return Promise.all(
      rows.map(async (row) => {
        const customer = byId.get(row.userId);
        return {
          ...(await this.present(row, false)),
          customer: customer ? { id: customer._id, name: customer.name, phone: customer.phone } : null,
        };
      }),
    );
  }

  private async present(membership: any, full: boolean) {
    const current = this.withExpiry(membership);
    const [ents, salon] = await Promise.all([
      this.entitlements.find({ membershipId: membership._id }).lean(),
      this.salons.findById(membership.salonId).lean(),
    ]);
    const serviceIds = ents.map((ent) => ent.serviceId).filter(Boolean);
    const services = await this.services.find({ _id: { $in: serviceIds } }).lean();
    const byId = new Map(services.map((service) => [service._id, service]));
    return {
      ...toPublic(current),
      salon: salon ? { id: salon._id, name: salon.name, city: salon.city, coverImage: salon.coverImage } : null,
      entitlements: ents.map((ent) => ({
        ...toPublic(ent),
        service: ent.serviceId ? toPublic(byId.get(ent.serviceId)) : null,
        remainingQuantity:
          ent.entitlementType === EntitlementType.QUANTITY ? ent.totalQuantity - ent.consumedQuantity : null,
        remainingValue: ent.entitlementType === EntitlementType.VALUE ? ent.totalValue - ent.consumedValue : null,
      })),
      events: full ? undefined : undefined,
    };
  }

  private withExpiry(membership: any) {
    if (
      membership.status === MembershipStatus.ACTIVE &&
      new Date(membership.expiresAt).getTime() < Date.now()
    ) {
      return { ...membership, status: MembershipStatus.EXPIRED };
    }
    return membership;
  }
}
