import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SalonsModule } from './salons/salons.module';
import { BranchesModule } from './branches/branches.module';
import { ServicesModule } from './services/services.module';
import { PlansModule } from './membership-plans/plans.module';
import { MembershipsModule } from './memberships/memberships.module';
import { PaymentsModule } from './payments/payments.module';
import { RedemptionsModule } from './redemptions/redemptions.module';
import { CommissionsModule } from './commissions/commissions.module';
import { MiddlemenModule } from './middlemen/middlemen.module';
import { PayoutsModule } from './payouts/payouts.module';
import { RefundsModule } from './refunds/refunds.module';
import { AdminModule } from './admin/admin.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { SupportModule } from './support/support.module';
import { ReviewsModule } from './reviews/reviews.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RootModule } from './root/root.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv, cache: true }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: process.env.NODE_ENV === 'test' ? 10_000 : 120 }],
    }),
    DatabaseModule,
    RootModule,
    HealthModule,
    AuthModule,
    UsersModule,
    SalonsModule,
    BranchesModule,
    ServicesModule,
    PlansModule,
    MembershipsModule,
    PaymentsModule,
    RedemptionsModule,
    CommissionsModule,
    MiddlemenModule,
    PayoutsModule,
    RefundsModule,
    AnalyticsModule,
    SupportModule,
    ReviewsModule,
    NotificationsModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
