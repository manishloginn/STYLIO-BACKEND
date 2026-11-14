import { MongoDoc } from '../common/interfaces/mongo-doc';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { hash } from 'bcryptjs';
import { Model } from 'mongoose';
import { pageArgs } from '../common/dto/page-query.dto';
import { giveSalonPlatformDefault } from '../commissions/commission-rates';
import { Role, SalonMemberRole, SalonStatus, UserStatus } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { normalizePhone } from '../common/utils/phone';
import { toPublic } from '../common/utils/public';
import { escapeRegex } from '../common/utils/regex';
import { AddStaffDto, CreateSalonDto, DiscoverQueryDto, UpdateSalonDto } from './salons.dto';
import { SalonAccessService } from './salon-access.service';

@Injectable()
export class SalonsService {
  constructor(
    @InjectModel('Salon') private readonly salons: Model<MongoDoc>,
    @InjectModel('SalonUser') private readonly salonUsers: Model<MongoDoc>,
    @InjectModel('User') private readonly users: Model<MongoDoc>,
    @InjectModel('Branch') private readonly branches: Model<MongoDoc>,
    @InjectModel('SalonService') private readonly services: Model<MongoDoc>,
    @InjectModel('MembershipPlan') private readonly plans: Model<MongoDoc>,
    @InjectModel('MembershipPlanItem') private readonly planItems: Model<MongoDoc>,
    @InjectModel('Review') private readonly reviews: Model<MongoDoc>,
    @InjectModel('AuditLog') private readonly audits: Model<MongoDoc>,
    @InjectModel('CommissionRule') private readonly rules: Model<MongoDoc>,
    private readonly access: SalonAccessService,
  ) {}

  async create(user: AuthUser, dto: CreateSalonDto) {
    if (user.role !== Role.SALON_OWNER && user.role !== Role.PLATFORM_ADMIN) {
      throw new ForbiddenException('Only a salon owner can register a salon');
    }
    const salon = await this.salons.create({
      ...dto,
      ownerId: user.sub,
      phone: normalizePhone(dto.phone),
      status: SalonStatus.PENDING,
      gallery: dto.gallery ?? [],
    });
    await this.salonUsers.create({
      userId: user.sub,
      salonId: salon._id,
      role: SalonMemberRole.OWNER,
      permissions: [],
    });
    return toPublic(salon);
  }

  async update(user: AuthUser, salonId: string, dto: UpdateSalonDto) {
    await this.access.assert(user, salonId, 'profile:write');
    const salon = await this.require(salonId);
    if (dto.phone) dto.phone = normalizePhone(dto.phone);
    Object.assign(salon, dto);
    await salon.save();
    return toPublic(salon);
  }

  async submit(user: AuthUser, salonId: string) {
    await this.access.assert(user, salonId, 'profile:write');
    const salon = await this.require(salonId);
    if (salon.status === SalonStatus.APPROVED) return toPublic(salon);
    salon.status = SalonStatus.PENDING;
    await salon.save();
    return toPublic(salon);
  }

  async mine(user: AuthUser) {
    const ids = await this.access.salonIdsFor(user.sub);
    const rows = await this.salons.find({ _id: { $in: ids } }).sort({ createdAt: -1 }).lean();
    return rows.map((row) => toPublic(row));
  }

  async discover(query: DiscoverQueryDto) {
    const { page, limit, skip } = pageArgs(query);
    const match: Record<string, unknown> = { status: SalonStatus.APPROVED };
    if (query.salonType) match.salonType = query.salonType;
    if (query.city) match.city = new RegExp(escapeRegex(query.city), 'i');
    if (query.q) {
      const pattern = new RegExp(escapeRegex(query.q), 'i');
      match.$or = [{ name: pattern }, { city: pattern }, { description: pattern }];
    }
    const priceMatch: Record<string, number> = {};
    if (query.minPrice != null) priceMatch.$gte = query.minPrice;
    if (query.maxPrice != null) priceMatch.$lte = query.maxPrice;
    const sort =
      query.sort === 'name'
        ? { name: 1 as const }
        : query.sort === 'price'
          ? { minPrice: 1 as const }
          : { createdAt: -1 as const };

    const pipeline: any[] = [
      { $match: match },
      {
        $lookup: {
          from: 'membership_plans',
          localField: '_id',
          foreignField: 'salonId',
          as: 'plans',
        },
      },
      {
        $lookup: {
          from: 'salon_services',
          localField: '_id',
          foreignField: 'salonId',
          as: 'services',
        },
      },
      {
        $addFields: {
          publishedPlans: {
            $filter: {
              input: '$plans',
              as: 'plan',
              cond: { $eq: ['$$plan.status', 'PUBLISHED'] },
            },
          },
        },
      },
    ];
    if (query.category) {
      pipeline.push({
        $match: { 'services.category': new RegExp(`^${escapeRegex(query.category)}$`, 'i') },
      });
    }
    if (query.hasMembership === 'true') {
      pipeline.push({ $match: { 'publishedPlans.0': { $exists: true } } });
    }
    if (query.minPrice != null || query.maxPrice != null) {
      pipeline.push({ $match: { publishedPlans: { $elemMatch: { sellingPrice: priceMatch } } } });
    }
    pipeline.push({
      $addFields: {
        minPrice: { $min: '$publishedPlans.sellingPrice' },
        planCount: { $size: '$publishedPlans' },
      },
    });
    pipeline.push({
      $project: {
        plans: 0,
        publishedPlans: 0,
        services: 0,
      },
    });
    pipeline.push({
      $facet: {
        items: [{ $sort: sort }, { $skip: skip }, { $limit: limit }],
        total: [{ $count: 'count' }],
      },
    });
    const [result] = await this.salons.aggregate(pipeline);
    const items = (result?.items ?? []).map((row: any) => toPublic(row));
    return { data: items, meta: { page, limit, total: result?.total?.[0]?.count ?? 0 } };
  }

  async detail(id: string, includePrivate = false) {
    const salon = await this.salons.findById(id).lean();
    if (!salon) throw new NotFoundException('Salon not found');
    if (!includePrivate && salon.status !== SalonStatus.APPROVED) {
      throw new NotFoundException('Salon not found');
    }
    const [branches, services, plans, rating] = await Promise.all([
      this.branches.find({ salonId: id, ...(includePrivate ? {} : { status: 'VERIFIED' }) }).lean(),
      this.services.find({ salonId: id, ...(includePrivate ? {} : { active: true }) }).lean(),
      this.plans
        .find({ salonId: id, ...(includePrivate ? {} : { status: 'PUBLISHED' }) })
        .lean(),
      this.reviews.aggregate([
        { $match: { salonId: id } },
        { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]),
    ]);
    const planIds = plans.map((plan) => plan._id);
    const planItems = await this.planItems.find({ planId: { $in: planIds } }).lean();
    const serviceById = new Map(services.map((service) => [service._id, service]));
    return {
      ...toPublic(salon),
      branches: branches.map((row) => toPublic(row)),
      services: services.map((row) => toPublic(row)),
      plans: plans.map((row) => ({
        ...toPublic(row),
        items: planItems
          .filter((item) => item.planId === row._id)
          .map((item) => ({
            ...toPublic(item),
            service: serviceById.get(String(item.serviceId))
              ? toPublic(serviceById.get(String(item.serviceId)))
              : null,
          })),
      })),
      rating: rating[0]
        ? { average: Math.round(rating[0].average * 10) / 10, count: rating[0].count }
        : null,
    };
  }

  async manageDetail(user: AuthUser, id: string) {
    await this.access.assert(user, id);
    return this.detail(id, true);
  }

  async decide(actor: AuthUser, salonId: string, status: SalonStatus, note?: string) {
    if (![SalonStatus.APPROVED, SalonStatus.REJECTED, SalonStatus.SUSPENDED].includes(status)) {
      throw new BadRequestException('Choose approve, reject, or suspend');
    }
    const link = await this.access.assert(actor, salonId);
    if (link.role !== SalonMemberRole.OWNER) {
      throw new ForbiddenException('Only the salon owner can approve this salon');
    }
    const salon = await this.require(salonId);
    salon.status = status;
    salon.reviewNote = note ?? '';
    await salon.save();
    await this.audits.create({
      actorId: actor.sub,
      action: `SALON_${status}`,
      entityType: 'salon',
      entityId: salonId,
      metadata: { note: note ?? '' },
    });
    if (status === SalonStatus.APPROVED) {
      await giveSalonPlatformDefault(this.rules, this.audits, actor.sub, salonId);
    }
    return toPublic(salon);
  }

  async listForAdmin(query: DiscoverQueryDto) {
    const { page, limit, skip } = pageArgs(query);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.q) filter.name = new RegExp(escapeRegex(query.q), 'i');
    const [items, total] = await Promise.all([
      this.salons.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.salons.countDocuments(filter),
    ]);
    return { data: items.map((row) => toPublic(row)), meta: { page, limit, total } };
  }

  async addStaff(user: AuthUser, salonId: string, dto: AddStaffDto) {
    await this.access.assert(user, salonId, 'staff:write');
    const phone = normalizePhone(dto.phone);
    let staff = await this.users.findOne({ phone });
    if (!staff) {
      if (!dto.password) {
        throw new BadRequestException('Set a password when creating a new staff account');
      }
      staff = await this.users.create({
        name: dto.name.trim(),
        phone,
        passwordHash: await hash(dto.password, 10),
        role: Role.SALON_STAFF,
        status: UserStatus.ACTIVE,
      });
    } else if (staff.role === Role.PLATFORM_ADMIN) {
      throw new BadRequestException('That account cannot be added as staff');
    } else if (staff.role === Role.CUSTOMER) {
      staff.role = Role.SALON_STAFF;
      staff.name = dto.name.trim();
      await staff.save();
    }
    await this.salonUsers.findOneAndUpdate(
      { userId: staff._id, salonId },
      { role: SalonMemberRole.STAFF, permissions: dto.permissions },
      { upsert: true, new: true },
    );
    return toPublic(staff);
  }

  async listStaff(user: AuthUser, salonId: string) {
    await this.access.assert(user, salonId);
    const links = await this.salonUsers.find({ salonId }).lean();
    const people = await this.users.find({ _id: { $in: links.map((link) => link.userId) } }).lean();
    return links.map((link) => ({
      ...toPublic(link),
      user: toPublic(people.find((person) => person._id === link.userId)),
    }));
  }

  private async require(id: string) {
    const salon = await this.salons.findById(id);
    if (!salon) throw new NotFoundException('Salon not found');
    return salon;
  }
}
