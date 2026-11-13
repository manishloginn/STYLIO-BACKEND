import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../common/decorators/auth.decorators';
import { Role } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { AnalyticsService } from './analytics.service';

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('admin')
  @Roles(Role.PLATFORM_ADMIN)
  admin() {
    return this.analytics.admin();
  }

  @Get('salon/:salonId')
  salon(
    @CurrentUser() user: AuthUser,
    @Param('salonId') salonId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analytics.salon(user, salonId, from, to);
  }
}
