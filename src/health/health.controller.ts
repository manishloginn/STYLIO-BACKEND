import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ApiTags } from '@nestjs/swagger';
import { Connection } from 'mongoose';
import { Public } from '../common/decorators/auth.decorators';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Public()
  @Get()
  async check() {
    if (this.connection.readyState !== 1) {
      throw new ServiceUnavailableException('Database unavailable');
    }
    await this.connection.db!.admin().ping();
    return { status: 'ok', database: 'up' };
  }
}
