import { Module } from '@nestjs/common';
import { MiddlemenController } from './middlemen.controller';
import { MiddlemenService } from './middlemen.service';

@Module({
  controllers: [MiddlemenController],
  providers: [MiddlemenService],
  exports: [MiddlemenService],
})
export class MiddlemenModule {}
