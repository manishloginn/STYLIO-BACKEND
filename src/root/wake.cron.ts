import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class WakeCron {
  private readonly logger = new Logger(WakeCron.name);

  @Cron('*/2 * * * *')
  async trigger() {
    const base = process.env.RENDER_EXTERNAL_URL?.replace(/\/$/, '');
    if (!base) {
      this.logger.log('ok');
      return 'ok';
    }
    try {
      const response = await fetch(`${base}/cron`);
      const body = (await response.text()).trim();
      this.logger.log(body || 'ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'request failed';
      this.logger.warn(`Wake cron failed: ${message}`);
    }
    return 'ok';
  }
}
