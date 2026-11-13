import { Module } from '@nestjs/common';
import { SalonAccessService } from './salon-access.service';
import { SalonsController } from './salons.controller';
import { SalonsService } from './salons.service';

@Module({
  controllers: [SalonsController],
  providers: [SalonsService, SalonAccessService],
  exports: [SalonsService, SalonAccessService],
})
export class SalonsModule {}
