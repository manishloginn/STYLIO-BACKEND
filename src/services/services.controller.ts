import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import { AuthUser } from '../common/interfaces/auth-user';
import { CreateServiceDto, UpdateServiceDto } from './services.dto';
import { ServicesService } from './services.service';

@ApiTags('services')
@Controller()
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Public()
  @Get('salons/:salonId/services')
  listPublic(@Param('salonId') salonId: string) {
    return this.services.listPublic(salonId);
  }

  @ApiBearerAuth()
  @Get('salons/:salonId/services/manage')
  list(@CurrentUser() user: AuthUser, @Param('salonId') salonId: string) {
    return this.services.list(user, salonId);
  }

  @ApiBearerAuth()
  @Post('salons/:salonId/services')
  create(
    @CurrentUser() user: AuthUser,
    @Param('salonId') salonId: string,
    @Body() dto: CreateServiceDto,
  ) {
    return this.services.create(user, salonId, dto);
  }

  @ApiBearerAuth()
  @Patch('services/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.services.update(user, id, dto);
  }
}
