import { MongoDoc } from '../common/interfaces/mongo-doc';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { pageArgs, PageQueryDto } from '../common/dto/page-query.dto';
import { PlanStatus, SalonMemberRole } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { toPublic } from '../common/utils/public';
import { PlanItemShape, PlanShape, validatePlanDefinition } from '../entitlements/entitlement.engine';
import { SalonAccessService } from '../salons/salon-access.service';
import { PlanDecisionDto, UpsertPlanDto } from './plans.dto';

@Injectable()
export class PlansService {
  constructor(
    @InjectModel('MembershipPlan') private readonly plans: Model<MongoDoc>,
    @InjectModel('MembershipPlanItem') private readonly items: Model<MongoDoc>,
    @InjectModel('MembershipPlanBranch') private readonly planBranches: Model<MongoDoc>,
    @InjectModel('SalonService') private readonly services: Model<MongoDoc>,
    @InjectModel('Branch') private readonly branches: Model<MongoDoc>,
    @InjectModel('AuditLog') private readonly audits: Model<MongoDoc>,
    private readonly access: SalonAccessService,
  ) {}

  async create(user: AuthUser, salonId: string, dto: UpsertPlanDto) {
    await this.access.assert(user, salonId, 'plans:write');
    await this.assertRefs(salonId, dto);
    validatePlanDefinition(dto, dto.items);
    const plan = await this.plans.create({
      salonId,
      name: dto.name,
      description: dto.description ?? '',
      planType: dto.planType,
      planSource: dto.planSource,
      externalPlanId: dto.externalPlanId,
      sellingPrice: dto.sellingPrice,
      validityDays: dto.validityDays,
      serviceValueLimit: dto.serviceValueLimit,
      discountPercentage: dto.discountPercentage,
      discountCap: dto.discountCap,
      stackingAllowed: dto.stackingAllowed ?? false,
      terms: dto.terms,
      restrictions: dto.restrictions ?? '',
      status: PlanStatus.DRAFT,
      createdBy: user.sub,
    });
    await this.replaceChildren(plan._id, dto);
    return this.hydrate(plan._id);
  }

  async update(user: AuthUser, planId: string, dto: UpsertPlanDto) {
    const plan = await this.plans.findById(planId);
    if (!plan) throw new NotFoundException('Plan not found');
    await this.access.assert(user, plan.salonId, 'plans:write');
    if (plan.status === PlanStatus.PENDING_APPROVAL) {
      throw new BadRequestException('This plan is waiting for review');
    }
    await this.assertRefs(plan.salonId, dto);
    validatePlanDefinition(dto, dto.items);
    Object.assign(plan, {
      name: dto.name,
      description: dto.description ?? '',
      planType: dto.planType,
      planSource: dto.planSource,
      externalPlanId: dto.externalPlanId,
      sellingPrice: dto.sellingPrice,
      validityDays: dto.validityDays,
      serviceValueLimit: dto.serviceValueLimit,
      discountPercentage: dto.discountPercentage,
      discountCap: dto.discountCap,
      stackingAllowed: dto.stackingAllowed ?? false,
      terms: dto.terms,
      restrictions: dto.restrictions ?? '',
    });
    if (plan.status === PlanStatus.REJECTED) plan.status = PlanStatus.DRAFT;
    await plan.save();
    await this.replaceChildren(plan._id, dto);
    return this.hydrate(plan._id);
  }

  async submit(user: AuthUser, planId: string) {
    const plan = await this.plans.findById(planId);
    if (!plan) throw new NotFoundException('Plan not found');
    await this.access.assert(user, plan.salonId, 'plans:write');
    const items = await this.items.find({ planId }).lean();
    validatePlanDefinition(plan.toObject() as unknown as PlanShape, items as unknown as PlanItemShape[]);
    plan.status = PlanStatus.PENDING_APPROVAL;
    await plan.save();
    return this.hydrate(planId);
  }

  async listForSalon(salonId: string, manage: boolean, user?: AuthUser, source?: string) {
    if (manage) {
      if (!user) throw new BadRequestException('Sign in required');
      await this.access.assert(user, salonId);
    }
    const filter: Record<string, unknown> = { salonId };
    if (!manage) filter.status = PlanStatus.PUBLISHED;
    if (source) filter.planSource = source;
    const rows = await this.plans.find(filter).sort({ createdAt: -1 }).lean();
    return Promise.all(rows.map((row) => this.hydrate(row._id)));
  }

  async getPublic(id: string) {
    const plan = await this.plans.findById(id).lean();
    if (!plan || plan.status !== PlanStatus.PUBLISHED) throw new NotFoundException('Plan not found');
    return this.hydrate(id);
  }

  async getManaged(user: AuthUser, id: string) {
    const plan = await this.plans.findById(id).lean();
    if (!plan) throw new NotFoundException('Plan not found');
    await this.access.assert(user, plan.salonId);
    return this.hydrate(id);
  }

  async compare(idsRaw: string) {
    const ids = idsRaw.split(',').map((id) => id.trim()).filter(Boolean).slice(0, 4);
    if (ids.length < 2) throw new BadRequestException('Choose at least two plans');
    const plans = await this.plans.find({ _id: { $in: ids }, status: PlanStatus.PUBLISHED }).lean();
    return Promise.all(plans.map((plan) => this.hydrate(plan._id)));
  }

  async decide(actor: AuthUser, planId: string, dto: PlanDecisionDto) {
    if (![PlanStatus.PUBLISHED, PlanStatus.REJECTED, PlanStatus.PAUSED].includes(dto.status)) {
      throw new BadRequestException('Choose published, rejected, or paused');
    }
    const plan = await this.plans.findById(planId);
    if (!plan) throw new NotFoundException('Plan not found');
    const link = await this.access.assert(actor, plan.salonId);
    if (link.role !== SalonMemberRole.OWNER) {
      throw new ForbiddenException('Only the salon owner can approve this plan');
    }
    plan.status = dto.status;
    plan.reviewNote = dto.note ?? '';
    await plan.save();
    await this.audits.create({
      actorId: actor.sub,
      action: `PLAN_${dto.status}`,
      entityType: 'membership_plan',
      entityId: planId,
      metadata: { note: dto.note ?? '' },
    });
    return this.hydrate(planId);
  }

  async adminList(query: PageQueryDto) {
    const { page, limit, skip } = pageArgs(query);
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    const [rows, total] = await Promise.all([
      this.plans.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.plans.countDocuments(filter),
    ]);
    const data = await Promise.all(rows.map((row) => this.hydrate(row._id)));
    return { data, meta: { page, limit, total } };
  }

  async loadForPurchase(planId: string) {
    const plan = await this.plans.findById(planId).lean();
    if (!plan || plan.status !== PlanStatus.PUBLISHED) {
      throw new BadRequestException('This plan is not available to purchase');
    }
    const [items, branches] = await Promise.all([
      this.items.find({ planId }).lean(),
      this.planBranches.find({ planId }).lean(),
    ]);
    return { plan, items, branches };
  }

  private async hydrate(planId: string) {
    const plan = await this.plans.findById(planId).lean();
    if (!plan) throw new NotFoundException('Plan not found');
    const [items, links, services] = await Promise.all([
      this.items.find({ planId }).lean(),
      this.planBranches.find({ planId }).lean(),
      this.services.find({ salonId: plan.salonId }).lean(),
    ]);
    const serviceName = new Map(services.map((service) => [service._id, service]));
    return {
      ...toPublic(plan),
      items: items.map((item) => ({
        ...toPublic(item),
        service: serviceName.get(item.serviceId) ? toPublic(serviceName.get(item.serviceId)) : null,
      })),
      branchIds: links.map((link) => link.branchId),
    };
  }

  private async replaceChildren(planId: string, dto: UpsertPlanDto) {
    await this.items.deleteMany({ planId });
    await this.planBranches.deleteMany({ planId });
    if (dto.items.length) {
      await this.items.insertMany(
        dto.items.map((item) => ({
          planId,
          serviceId: item.serviceId,
          quantityLimit: item.quantityLimit,
          valueDeduction: item.valueDeduction,
          excluded: item.excluded ?? false,
        })),
      );
    }
    if (dto.branchIds.length) {
      await this.planBranches.insertMany(dto.branchIds.map((branchId) => ({ planId, branchId })));
    }
  }

  private async assertRefs(salonId: string, dto: UpsertPlanDto) {
    const serviceIds = dto.items.map((item) => item.serviceId);
    const services = await this.services.find({ _id: { $in: serviceIds }, salonId }).lean();
    if (services.length !== new Set(serviceIds).size) {
      throw new BadRequestException('Every service must belong to this salon');
    }
    if (dto.branchIds.length) {
      const branches = await this.branches.find({ _id: { $in: dto.branchIds }, salonId }).lean();
      if (branches.length !== new Set(dto.branchIds).size) {
        throw new BadRequestException('Every branch must belong to this salon');
      }
    }
  }
}
