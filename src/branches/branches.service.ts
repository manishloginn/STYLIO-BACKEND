import { MongoDoc } from '../common/interfaces/mongo-doc';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BranchStatus, SalonMemberRole } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { toPublic } from '../common/utils/public';
import { SalonAccessService } from '../salons/salon-access.service';
import { BranchDecisionDto, CreateBranchDto, UpdateBranchDto } from './branches.dto';

@Injectable()
export class BranchesService {
  constructor(
    @InjectModel('Branch') private readonly branches: Model<MongoDoc>,
    @InjectModel('AuditLog') private readonly audits: Model<MongoDoc>,
    private readonly access: SalonAccessService,
  ) {}

  async listPublic(salonId: string) {
    const rows = await this.branches.find({ salonId, status: BranchStatus.VERIFIED }).lean();
    return rows.map((row) => toPublic(row));
  }

  async list(user: AuthUser, salonId: string) {
    await this.access.assert(user, salonId);
    const rows = await this.branches.find({ salonId }).sort({ createdAt: -1 }).lean();
    return rows.map((row) => toPublic(row));
  }

  async create(user: AuthUser, salonId: string, dto: CreateBranchDto) {
    await this.access.assert(user, salonId, 'branches:write');
    const branch = await this.branches.create({ ...dto, salonId, status: BranchStatus.PENDING });
    return toPublic(branch);
  }

  async update(user: AuthUser, id: string, dto: UpdateBranchDto) {
    const branch = await this.require(id);
    await this.access.assert(user, branch.salonId, 'branches:write');
    Object.assign(branch, dto);
    await branch.save();
    return toPublic(branch);
  }

  async decide(actor: AuthUser, id: string, dto: BranchDecisionDto) {
    if (![BranchStatus.VERIFIED, BranchStatus.REJECTED].includes(dto.status)) {
      throw new BadRequestException('Choose verified or rejected');
    }
    const branch = await this.require(id);
    const link = await this.access.assert(actor, branch.salonId);
    if (link.role !== SalonMemberRole.OWNER) {
      throw new ForbiddenException('Only the salon owner can approve this branch');
    }
    branch.status = dto.status;
    branch.reviewNote = dto.note ?? '';
    await branch.save();
    await this.audits.create({
      actorId: actor.sub,
      action: `BRANCH_${dto.status}`,
      entityType: 'branch',
      entityId: id,
      metadata: { note: dto.note ?? '' },
    });
    return toPublic(branch);
  }

  async listPending() {
    const rows = await this.branches.find({ status: BranchStatus.PENDING }).sort({ createdAt: -1 }).lean();
    return rows.map((row) => toPublic(row));
  }

  private async require(id: string) {
    const branch = await this.branches.findById(id);
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }
}
