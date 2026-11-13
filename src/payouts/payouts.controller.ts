import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../common/interfaces/auth-user';
import { PayoutsService } from './payouts.service';

@ApiTags('payouts')
@ApiBearerAuth()
@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payouts: PayoutsService) {}

  @Get('salon/:salonId')
  forSalon(@CurrentUser() user: AuthUser, @Param('salonId') salonId: string) {
    return this.payouts.forSalon(user, salonId);
  }
}
