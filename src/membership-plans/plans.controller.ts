import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import { AuthUser } from '../common/interfaces/auth-user';
import { CompareQueryDto, PlanDecisionDto, UpsertPlanDto } from './plans.dto';
import { PlansService } from './plans.service';

@ApiTags('membership-plans')
@Controller()
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Public()
  @Get('membership-plans/compare')
  compare(@Query() query: CompareQueryDto) {
    return this.plans.compare(query.ids);
  }

  @Public()
  @Get('membership-plans/:id')
  getOne(@Param('id') id: string) {
    return this.plans.getPublic(id);
  }

  @Public()
  @Get('salons/:salonId/membership-plans')
  listPublic(@Param('salonId') salonId: string, @Query('planSource') planSource?: string) {
    return this.plans.listForSalon(salonId, false, undefined, planSource);
  }

  @ApiBearerAuth()
  @Get('salons/:salonId/membership-plans/manage')
  listManage(
    @CurrentUser() user: AuthUser,
    @Param('salonId') salonId: string,
    @Query('planSource') planSource?: string,
  ) {
    return this.plans.listForSalon(salonId, true, user, planSource);
  }

  @ApiBearerAuth()
  @Post('salons/:salonId/membership-plans')
  create(@CurrentUser() user: AuthUser, @Param('salonId') salonId: string, @Body() dto: UpsertPlanDto) {
    return this.plans.create(user, salonId, dto);
  }

  @ApiBearerAuth()
  @Patch('membership-plans/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertPlanDto) {
    return this.plans.update(user, id, dto);
  }

  @ApiBearerAuth()
  @Post('membership-plans/:id/submit')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.plans.submit(user, id);
  }

  @ApiBearerAuth()
  @Post('membership-plans/:id/decision')
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PlanDecisionDto) {
    return this.plans.decide(user, id, dto);
  }

  @ApiBearerAuth()
  @Get('membership-plans/:id/manage')
  managed(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.plans.getManaged(user, id);
  }
}
