import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InjectConnection, MongooseModule } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import {
  AttributionRecordSchema,
  AuditLogSchema,
  BranchSchema,
  CommissionRuleSchema,
  CommissionSchema,
  CommissionTransactionSchema,
  EntitlementLedgerSchema,
  MembershipEntitlementSchema,
  MembershipEventSchema,
  MembershipPlanBranchSchema,
  MembershipPlanItemSchema,
  MembershipPlanSchema,
  MembershipSchema,
  MiddlemanSchema,
  MiddlemanPayoutSchema,
  MiddlemanSalonMappingSchema,
  NotificationSchema,
  PaymentSchema,
  RedemptionChallengeSchema,
  RedemptionSchema,
  RefundSchema,
  ReserveLedgerSchema,
  ReviewSchema,
  SalonPayoutSchema,
  SalonSchema,
  SalonServiceSchema,
  SalonUserSchema,
  SupportTicketSchema,
  UserSchema,
} from './schemas';

export const MODELS = [
  { name: 'User', schema: UserSchema },
  { name: 'Salon', schema: SalonSchema },
  { name: 'SalonUser', schema: SalonUserSchema },
  { name: 'Branch', schema: BranchSchema },
  { name: 'SalonService', schema: SalonServiceSchema },
  { name: 'MembershipPlan', schema: MembershipPlanSchema },
  { name: 'MembershipPlanItem', schema: MembershipPlanItemSchema },
  { name: 'MembershipPlanBranch', schema: MembershipPlanBranchSchema },
  { name: 'Membership', schema: MembershipSchema },
  { name: 'MembershipEntitlement', schema: MembershipEntitlementSchema },
  { name: 'EntitlementLedger', schema: EntitlementLedgerSchema },
  { name: 'Payment', schema: PaymentSchema },
  { name: 'CommissionRule', schema: CommissionRuleSchema },
  { name: 'Commission', schema: CommissionSchema },
  { name: 'CommissionTransaction', schema: CommissionTransactionSchema },
  { name: 'Middleman', schema: MiddlemanSchema },
  { name: 'MiddlemanSalonMapping', schema: MiddlemanSalonMappingSchema },
  { name: 'MiddlemanPayout', schema: MiddlemanPayoutSchema },
  { name: 'AttributionRecord', schema: AttributionRecordSchema },
  { name: 'RedemptionChallenge', schema: RedemptionChallengeSchema },
  { name: 'Redemption', schema: RedemptionSchema },
  { name: 'SalonPayout', schema: SalonPayoutSchema },
  { name: 'ReserveLedger', schema: ReserveLedgerSchema },
  { name: 'Refund', schema: RefundSchema },
  { name: 'MembershipEvent', schema: MembershipEventSchema },
  { name: 'AuditLog', schema: AuditLogSchema },
  { name: 'SupportTicket', schema: SupportTicketSchema },
  { name: 'Review', schema: ReviewSchema },
  { name: 'Notification', schema: NotificationSchema },
];

@Injectable()
export class ReplicaSetCheck implements OnModuleInit {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async onModuleInit() {
    const hello = await this.connection.db!.admin().command({ hello: 1 });
    if (!hello.setName) {
      throw new Error(
        'MongoDB must run as a replica set (mongod --replSet rs0, then rs.initiate()). Stylio uses transactions for payments and redemptions.',
      );
    }
  }
}

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        serverSelectionTimeoutMS: 8000,
      }),
    }),
    MongooseModule.forFeature(MODELS),
  ],
  providers: [ReplicaSetCheck],
  exports: [MongooseModule],
})
export class DatabaseModule {}
