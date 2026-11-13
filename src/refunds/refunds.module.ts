import { Module } from '@nestjs/common';
import { MiddlemenModule } from '../middlemen/middlemen.module';
import { RefundsService } from './refunds.service';

@Module({
  imports: [MiddlemenModule],
  providers: [RefundsService],
  exports: [RefundsService],
})
export class RefundsModule {}
