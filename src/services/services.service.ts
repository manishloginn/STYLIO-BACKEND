import { MongoDoc } from '../common/interfaces/mongo-doc';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthUser } from '../common/interfaces/auth-user';
import { toPublic } from '../common/utils/public';
import { SalonAccessService } from '../salons/salon-access.service';
import { CreateServiceDto, UpdateServiceDto } from './services.dto';

@Injectable()
export class ServicesService {
  constructor(
    @InjectModel('SalonService') private readonly services: Model<MongoDoc>,
    private readonly access: SalonAccessService,
  ) {}

  async listPublic(salonId: string) {
    const rows = await this.services.find({ salonId, active: true }).sort({ category: 1, name: 1 }).lean();
    return rows.map((row) => toPublic(row));
  }

  async list(user: AuthUser, salonId: string) {
    await this.access.assert(user, salonId);
    const rows = await this.services.find({ salonId }).sort({ category: 1, name: 1 }).lean();
    return rows.map((row) => toPublic(row));
  }

  async create(user: AuthUser, salonId: string, dto: CreateServiceDto) {
    await this.access.assert(user, salonId, 'services:write');
    const service = await this.services.create({ ...dto, salonId, active: true });
    return toPublic(service);
  }

  async update(user: AuthUser, id: string, dto: UpdateServiceDto) {
    const service = await this.services.findById(id);
    if (!service) throw new NotFoundException('Service not found');
    await this.access.assert(user, service.salonId, 'services:write');
    Object.assign(service, dto);
    await service.save();
    return toPublic(service);
  }
}
