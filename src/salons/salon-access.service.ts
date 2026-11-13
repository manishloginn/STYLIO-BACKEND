import { MongoDoc } from '../common/interfaces/mongo-doc';
import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role, SalonMemberRole, SalonPermission } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';

@Injectable()
export class SalonAccessService {
  constructor(@InjectModel('SalonUser') private readonly salonUsers: Model<MongoDoc>) {}

  async assert(user: AuthUser, salonId: string, permission?: SalonPermission) {
    if (user.role === Role.PLATFORM_ADMIN) return { role: SalonMemberRole.OWNER, permissions: [] };
    const link = await this.salonUsers.findOne({ userId: user.sub, salonId }).lean();
    if (!link) {
      throw new ForbiddenException('You cannot access this salon');
    }
    if (permission && link.role !== SalonMemberRole.OWNER && !link.permissions?.includes(permission)) {
      throw new ForbiddenException('You do not have permission for this action');
    }
    return link;
  }

  async salonIdsFor(userId: string): Promise<string[]> {
    const links = await this.salonUsers.find({ userId }).lean();
    return links.map((link) => link.salonId);
  }
}
