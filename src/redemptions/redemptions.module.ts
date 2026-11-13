import { Module } from '@nestjs/common';
import { SalonsModule } from '../salons/salons.module';
import { RedemptionsController } from './redemptions.controller';
import { RedemptionsService } from './redemptions.service';

@Module({
  imports: [SalonsModule],
  controllers: [RedemptionsController],
  providers: [RedemptionsService],
  exports: [RedemptionsService],
})
export class RedemptionsModule {}
