import { MongoDoc } from '../common/interfaces/mongo-doc';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Roles } from '../common/decorators/auth.decorators';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { Role, SalonStatus } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { toPublic } from '../common/utils/public';
import { AnalyticsService } from '../analytics/analytics.service';
import { BranchesService } from '../branches/branches.service';
import { BranchDecisionDto } from '../branches/branches.dto';
import { CommissionsService } from '../commissions/commissions.service';
import { CreateRuleDto } from '../commissions/commissions.dto';
import { MembershipsService } from '../memberships/memberships.service';
import { PaymentsService } from '../payments/payments.service';
import { CreateRefundDto } from '../payments/payments.dto';
import { PayoutsService } from '../payouts/payouts.service';
import { CreatePayoutDto } from '../payouts/payouts.dto';
import { PlansService } from '../membership-plans/plans.service';
import { PlanDecisionDto } from '../membership-plans/plans.dto';
import { RedemptionsService } from '../redemptions/redemptions.service';
import { RefundsService } from '../refunds/refunds.service';
import { SalonsService } from '../salons/salons.service';
import { DecisionDto, DiscoverQueryDto } from '../salons/salons.dto';
import { SupportService } from '../support/support.service';
import { UpdateTicketDto } from '../support/support.dto';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly salons: SalonsService,
    private readonly branches: BranchesService,
    private readonly plans: PlansService,
    private readonly memberships: MembershipsService,
    private readonly payments: PaymentsService,
    private readonly redemptions: RedemptionsService,
    private readonly refunds: RefundsService,
    private readonly commissions: CommissionsService,
    private readonly payouts: PayoutsService,
    private readonly support: SupportService,
    @InjectModel('User') private readonly users: Model<MongoDoc>,
  ) {}

  @Get('overview')
  overview() {
    return this.analytics.admin();
  }

  @Get('salons')
  salonsList(@Query() query: DiscoverQueryDto) {
    return this.salons.listForAdmin(query);
  }

  @Post('salons/:id/decision')
  salonDecision(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.salons.decide(user, id, dto.status as SalonStatus, dto.note);
  }

  @Get('branches')
  branchesList(@Query('status') status?: string) {
    return this.branches.adminList(status);
  }

  @Post('branches/:id/decision')
  branchDecision(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: BranchDecisionDto) {
    return this.branches.decide(user, id, dto);
  }

  @Get('plans')
  plansList(@Query() query: PageQueryDto) {
    return this.plans.adminList(query);
  }

  @Post('plans/:id/decision')
  planDecision(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PlanDecisionDto) {
    return this.plans.decide(user, id, dto);
  }

  @Get('users')
  async usersList(@Query() query: PageQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {};
    if (query.status) filter.role = query.status;
    if (query.q) filter.phone = query.q.replace(/\D/g, '');
    const [items, total] = await Promise.all([
      this.users
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.users.countDocuments(filter),
    ]);
    return { data: items.map((row) => toPublic(row)), meta: { page, limit, total } };
  }

  @Get('memberships')
  membershipsList(@Query() query: PageQueryDto) {
    return this.memberships.adminList(query);
  }

  @Get('payments')
  paymentsList(@Query() query: PageQueryDto) {
    return this.payments.adminList(query);
  }

  @Get('redemptions')
  redemptionsList() {
    return this.redemptions.adminList();
  }

  @Get('refunds')
  refundsList() {
    return this.refunds.list();
  }

  @Post('refunds')
  createRefund(@CurrentUser() user: AuthUser, @Body() dto: CreateRefundDto) {
    return this.refunds.create(user, dto);
  }

  @Get('commission-rules')
  rules() {
    return this.commissions.listRules();
  }

  @Get('commissions')
  commissionsList() {
    return this.commissions.listRecent();
  }

  @Post('commission-rules')
  createRule(@CurrentUser() user: AuthUser, @Body() dto: CreateRuleDto) {
    return this.commissions.createRule(user, dto);
  }

  @Get('reserves')
  reserves() {
    return this.payouts.listReserves();
  }

  @Get('payouts')
  payoutsList() {
    return this.payouts.listAll();
  }

  @Post('payouts')
  payout(@CurrentUser() user: AuthUser, @Body() dto: CreatePayoutDto) {
    return this.payouts.create(user, dto);
  }

  @Get('tickets')
  tickets() {
    return this.support.all();
  }

  @Patch('tickets/:id')
  ticket(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.support.update(user, id, dto);
  }
}
