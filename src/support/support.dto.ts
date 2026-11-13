import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TicketStatus } from '../common/enums';

export class CreateTicketDto {
  @IsString()
  @MinLength(3)
  subject!: string;

  @IsString()
  @MinLength(3)
  message!: string;

  @IsOptional()
  @IsString()
  salonId?: string;
}

export class UpdateTicketDto {
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsString()
  @MinLength(1)
  message?: string;
}
