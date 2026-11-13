import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RootController } from './root.controller';
import { WakeCron } from './wake.cron';

const scheduling = process.env.NODE_ENV === 'test' ? [] : [ScheduleModule.forRoot()];
const crons = process.env.NODE_ENV === 'test' ? [] : [WakeCron];

@Module({
  imports: scheduling,
  controllers: [RootController],
  providers: crons,
})
export class RootModule {}
