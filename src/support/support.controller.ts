import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import { AuthUser } from '../common/interfaces/auth-user';
import { CreateTicketDto } from './support.dto';
import { SupportService } from './support.service';

@ApiTags('support')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTicketDto) {
    return this.support.create(user, dto);
  }

  @Get('me')
  mine(@CurrentUser() user: AuthUser) {
    return this.support.mine(user);
  }
}
