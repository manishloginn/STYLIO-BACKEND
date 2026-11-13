import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../common/interfaces/auth-user';
import { CommissionsService } from './commissions.service';

@ApiTags('commissions')
@ApiBearerAuth()
@Controller('commissions')
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  @Get('salon/:salonId')
  forSalon(@CurrentUser() user: AuthUser, @Param('salonId') salonId: string) {
    return this.commissions.forSalon(user, salonId);
  }
}
