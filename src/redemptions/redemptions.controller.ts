import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../common/interfaces/auth-user';
import { CreateChallengeDto, VerifyRedemptionDto } from './redemptions.dto';
import { RedemptionsService } from './redemptions.service';

@ApiTags('redemptions')
@ApiBearerAuth()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('redemptions')
export class RedemptionsController {
  constructor(private readonly redemptions: RedemptionsService) {}

  @Post('challenges')
  challenge(@CurrentUser() user: AuthUser, @Body() dto: CreateChallengeDto) {
    return this.redemptions.createChallenge(user, dto);
  }

  @HttpCode(200)
  @Post('verify')
  verify(@CurrentUser() user: AuthUser, @Body() dto: VerifyRedemptionDto) {
    return this.redemptions.verify(user, dto);
  }

  @HttpCode(200)
  @Post(':id/reverse')
  reverse(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.redemptions.reverse(user, id);
  }

  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.redemptions.mine(user);
  }

  @Get('salon/:salonId')
  forSalon(@CurrentUser() user: AuthUser, @Param('salonId') salonId: string) {
    return this.redemptions.forSalon(user, salonId);
  }
}
