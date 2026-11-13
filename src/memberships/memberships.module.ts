import { Module } from '@nestjs/common';
import { MiddlemenModule } from '../middlemen/middlemen.module';
import { SalonsModule } from '../salons/salons.module';
import { ActivationService } from './activation.service';
import { MembershipsController } from './memberships.controller';
import { MembershipsService } from './memberships.service';

@Module({
  imports: [SalonsModule, MiddlemenModule],
  controllers: [MembershipsController],
  providers: [MembershipsService, ActivationService],
  exports: [MembershipsService, ActivationService],
})
export class MembershipsModule {}
