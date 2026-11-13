import { MongoDoc } from '../common/interfaces/mongo-doc';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthUser } from '../common/interfaces/auth-user';
import { toPublic } from '../common/utils/public';
import { CreateReviewDto } from './reviews.dto';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel('Review') private readonly reviews: Model<MongoDoc>,
    @InjectModel('Membership') private readonly memberships: Model<MongoDoc>,
    @InjectModel('User') private readonly users: Model<MongoDoc>,
  ) {}

  async list(salonId: string) {
    const rows = await this.reviews.find({ salonId }).sort({ createdAt: -1 }).lean();
    const people = await this.users
      .find({ _id: { $in: rows.map((row) => row.userId) } })
      .select('name')
      .lean();
    const names = new Map(people.map((person) => [person._id, person.name]));
    return rows.map((row) => ({ ...toPublic(row), author: names.get(row.userId) ?? 'Member' }));
  }

  async create(user: AuthUser, salonId: string, dto: CreateReviewDto) {
    const membership = await this.memberships.findOne({ userId: user.sub, salonId }).lean();
    if (!membership) {
      throw new BadRequestException('Reviews are limited to customers with a membership at this salon');
    }
    const review = await this.reviews.create({
      userId: user.sub,
      salonId,
      rating: dto.rating,
      comment: dto.comment ?? '',
    });
    return toPublic(review);
  }
}
