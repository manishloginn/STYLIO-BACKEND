import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { AuthUser } from '../common/interfaces/auth-user';
import { DirectSaleDto } from '../payments/payments.dto';
import { MembershipsService } from './memberships.service';

@ApiTags('memberships')
@ApiBearerAuth()
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get('me')
  mine(@CurrentUser() user: AuthUser, @Query() query: PageQueryDto) {
    return this.memberships.mine(user, query);
  }

  @Get('salon/:salonId')
  forSalon(@CurrentUser() user: AuthUser, @Param('salonId') salonId: string, @Query() query: PageQueryDto) {
    return this.memberships.forSalon(user, salonId, query);
  }

  @Post('direct')
  direct(@CurrentUser() user: AuthUser, @Body() dto: DirectSaleDto) {
    return this.memberships.direct(user, dto);
  }

  @Get(':id')
  one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.memberships.one(user, id);
  }
}
