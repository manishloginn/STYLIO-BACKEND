import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import { AuthUser } from '../common/interfaces/auth-user';
import { CreateReviewDto } from './reviews.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('salons/:salonId/reviews')
  list(@Param('salonId') salonId: string) {
    return this.reviews.list(salonId);
  }

  @ApiBearerAuth()
  @Post('salons/:salonId/reviews')
  create(@CurrentUser() user: AuthUser, @Param('salonId') salonId: string, @Body() dto: CreateReviewDto) {
    return this.reviews.create(user, salonId, dto);
  }
}
