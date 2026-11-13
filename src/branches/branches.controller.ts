import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import { AuthUser } from '../common/interfaces/auth-user';
import { BranchDecisionDto, CreateBranchDto, UpdateBranchDto } from './branches.dto';
import { BranchesService } from './branches.service';

@ApiTags('branches')
@Controller()
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Public()
  @Get('salons/:salonId/branches')
  listPublic(@Param('salonId') salonId: string) {
    return this.branches.listPublic(salonId);
  }

  @ApiBearerAuth()
  @Get('salons/:salonId/branches/manage')
  list(@CurrentUser() user: AuthUser, @Param('salonId') salonId: string) {
    return this.branches.list(user, salonId);
  }

  @ApiBearerAuth()
  @Post('salons/:salonId/branches')
  create(
    @CurrentUser() user: AuthUser,
    @Param('salonId') salonId: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.branches.create(user, salonId, dto);
  }

  @ApiBearerAuth()
  @Patch('branches/:id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branches.update(user, id, dto);
  }

  @ApiBearerAuth()
  @Post('branches/:id/decision')
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: BranchDecisionDto) {
    return this.branches.decide(user, id, dto);
  }
}
