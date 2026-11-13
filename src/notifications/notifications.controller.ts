import { MongoDoc } from '../common/interfaces/mongo-doc';
import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../common/interfaces/auth-user';
import { toPublic } from '../common/utils/public';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(@InjectModel('Notification') private readonly notifications: Model<MongoDoc>) {}

  @Get('me')
  async mine(@CurrentUser() user: AuthUser) {
    const rows = await this.notifications.find({ userId: user.sub }).sort({ createdAt: -1 }).limit(50).lean();
    return rows.map((row) => toPublic(row));
  }

  @Post(':id/read')
  async read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const row = await this.notifications.findOneAndUpdate(
      { _id: id, userId: user.sub },
      { readAt: new Date() },
      { new: true },
    );
    return toPublic(row);
  }
}
