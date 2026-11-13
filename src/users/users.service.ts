import { MongoDoc } from '../common/interfaces/mongo-doc';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { toPublic } from '../common/utils/public';
import { UpdateProfileDto } from './users.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel('User') private readonly users: Model<MongoDoc>) {}

  async me(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return toPublic(user);
  }

  async update(userId: string, dto: UpdateProfileDto) {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (dto.name) user.name = dto.name.trim();
    if (dto.email) user.email = dto.email.trim().toLowerCase();
    await user.save();
    return toPublic(user);
  }
}
