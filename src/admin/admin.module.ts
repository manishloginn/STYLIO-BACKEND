import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { BranchesModule } from '../branches/branches.module';
import { CommissionsModule } from '../commissions/commissions.module';
import { MembershipsModule } from '../memberships/memberships.module';
import { PaymentsModule } from '../payments/payments.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { PlansModule } from '../membership-plans/plans.module';
import { RedemptionsModule } from '../redemptions/redemptions.module';
import { RefundsModule } from '../refunds/refunds.module';
import { SalonsModule } from '../salons/salons.module';
import { SupportModule } from '../support/support.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [
    AnalyticsModule,
    SalonsModule,
    BranchesModule,
    PlansModule,
    MembershipsModule,
    PaymentsModule,
    RedemptionsModule,
    RefundsModule,
    CommissionsModule,
    PayoutsModule,
    SupportModule,
  ],
  controllers: [AdminController],
})
export class AdminModule {}
