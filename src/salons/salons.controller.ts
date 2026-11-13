import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, Roles } from '../common/decorators/auth.decorators';
import { Role } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import { AddStaffDto, CreateSalonDto, DecisionDto, DiscoverQueryDto, UpdateSalonDto } from './salons.dto';
import { SalonsService } from './salons.service';

@ApiTags('salons')
@Controller('salons')
export class SalonsController {
  constructor(private readonly salons: SalonsService) {}

  @Public()
  @Get()
  discover(@Query() query: DiscoverQueryDto) {
    return this.salons.discover(query);
  }

  @ApiBearerAuth()
  @Get('mine')
  mine(@CurrentUser() user: AuthUser) {
    return this.salons.mine(user);
  }

  @Public()
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.salons.detail(id);
  }

  @ApiBearerAuth()
  @Post()
  @Roles(Role.SALON_OWNER, Role.PLATFORM_ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateSalonDto) {
    return this.salons.create(user, dto);
  }

  @ApiBearerAuth()
  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateSalonDto) {
    return this.salons.update(user, id, dto);
  }

  @ApiBearerAuth()
  @Post(':id/submit')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salons.submit(user, id);
  }

  @ApiBearerAuth()
  @Post(':id/decision')
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.salons.decide(user, id, dto.status, dto.note);
  }

  @ApiBearerAuth()
  @Get(':id/manage')
  manage(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salons.manageDetail(user, id);
  }

  @ApiBearerAuth()
  @Get(':id/staff')
  staff(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.salons.listStaff(user, id);
  }

  @ApiBearerAuth()
  @Post(':id/staff')
  addStaff(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddStaffDto) {
    return this.salons.addStaff(user, id, dto);
  }
}
