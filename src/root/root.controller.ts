import { Controller, Get, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../common/decorators/auth.decorators';

@Controller({ version: VERSION_NEUTRAL })
export class RootController {
  @Public()
  @Get()
  hello(@Res() response: Response) {
    response.type('text/plain').send('hello world');
  }

  @Public()
  @Get('cron')
  cron(@Res() response: Response) {
    response.type('text/plain').send('ok');
  }
}
