import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipsModule } from '../memberships/memberships.module';
import { DevPaymentGateway, PaymentGateway, RazorpayPaymentGateway } from './payment.gateway';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [MembershipsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    {
      provide: PaymentGateway,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('PAYMENT_PROVIDER') === 'razorpay'
          ? new RazorpayPaymentGateway(config)
          : new DevPaymentGateway(config),
    },
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
