import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../common/decorators/auth.decorators';
import { Role } from '../common/enums';
import { AuthUser } from '../common/interfaces/auth-user';
import {
  ApproveTransactionsDto,
  CreateMappingDto,
  CreateMiddlemanDto,
  CreateMiddlemanPayoutDto,
  TransactionQueryDto,
  UpdateMiddlemanDto,
} from './middlemen.dto';
import { MiddlemenService } from './middlemen.service';

@ApiTags('middlemen')
@ApiBearerAuth()
@Roles(Role.PLATFORM_ADMIN)
@Controller('admin/middlemen')
export class MiddlemenController {
  constructor(private readonly middlemen: MiddlemenService) {}

  @Get()
  list() {
    return this.middlemen.list();
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMiddlemanDto) {
    return this.middlemen.create(user, dto);
  }

  @Get('transactions')
  transactions(@Query() query: TransactionQueryDto) {
    return this.middlemen.listTransactions(query);
  }

  @Post('transactions/approve')
  approve(@CurrentUser() user: AuthUser, @Body() dto: ApproveTransactionsDto) {
    return this.middlemen.approve(user, dto);
  }

  @Post('payouts')
  payout(@CurrentUser() user: AuthUser, @Body() dto: CreateMiddlemanPayoutDto) {
    return this.middlemen.recordPayout(user, dto);
  }

  @Post('mappings/:mappingId/end')
  endMapping(@CurrentUser() user: AuthUser, @Param('mappingId') mappingId: string) {
    return this.middlemen.endMapping(user, mappingId);
  }

  @Get('salons/:salonId')
  salonMapping(@Param('salonId') salonId: string) {
    return this.middlemen.salonMapping(salonId);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.middlemen.detail(id);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateMiddlemanDto) {
    return this.middlemen.update(user, id, dto);
  }

  @Post(':id/mappings')
  map(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: CreateMappingDto) {
    return this.middlemen.mapSalon(user, id, dto);
  }

  @Get(':id/audit')
  audit(@Param('id') id: string) {
    return this.middlemen.audit(id);
  }
}
