import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import { PageQueryDto } from '../common/dto/page-query.dto';
import { AuthUser } from '../common/interfaces/auth-user';
import { CreateOrderDto, DevConfirmDto, RazorpayConfirmDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @ApiBearerAuth()
  @Post('orders')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrderDto, @Req() request: Request) {
    return this.payments.createOrder(user, dto, `${request.protocol}://${request.get('host')}`);
  }

  @Public()
  @HttpCode(200)
  @Post('webhook')
  webhook(@Req() request: Request & { rawBody?: Buffer }, @Headers('x-stylio-signature') stylio?: string, @Headers('x-razorpay-signature') razorpay?: string) {
    const raw = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    return this.payments.webhook(raw, stylio || razorpay);
  }

  @Public()
  @HttpCode(200)
  @Post('razorpay/webhook')
  razorpayWebhook(@Req() request: Request & { rawBody?: Buffer }, @Headers('x-razorpay-signature') signature?: string) {
    const raw = request.rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    return this.payments.webhook(raw, signature);
  }

  @Public()
  @Post('razorpay/callback')
  async razorpayCallback(
    @Body() body: Record<string, unknown>,
    @Query('return') returnTo: string | undefined,
    @Res() response: Response,
  ) {
    const url = await this.payments.razorpayCallback(body ?? {}, returnTo);
    response.redirect(303, url);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('dev/confirm')
  devConfirm(@CurrentUser() user: AuthUser, @Body() dto: DevConfirmDto) {
    return this.payments.devConfirm(user, dto);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('razorpay/confirm')
  confirmRazorpay(@CurrentUser() user: AuthUser, @Body() dto: RazorpayConfirmDto) {
    return this.payments.confirmRazorpay(user, dto);
  }

  @ApiBearerAuth()
  @Get('me')
  mine(@CurrentUser() user: AuthUser, @Query() query: PageQueryDto) {
    return this.payments.mine(user, query);
  }

  @ApiBearerAuth()
  @Get(':id')
  one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.payments.getOne(user, id);
  }
}
