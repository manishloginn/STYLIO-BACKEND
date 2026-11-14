import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { CommissionTxnStatus, MiddlemanStatus } from '../common/enums';

export class CreateMiddlemanDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsInt()
  @Min(0)
  @Max(10_000)
  defaultRateBps!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  salonId?: string;
}

export class UpdateMiddlemanDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  defaultRateBps?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn([MiddlemanStatus.ACTIVE, MiddlemanStatus.INACTIVE])
  status?: MiddlemanStatus;
}

export class CreateMappingDto {
  @IsString()
  salonId!: string;

  @IsInt()
  @Min(0)
  @Max(10_000)
  agreedRateBps!: number;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;
}

export class TransactionQueryDto {
  @IsOptional()
  @IsString()
  middlemanId?: string;

  @IsOptional()
  @IsString()
  salonId?: string;

  @IsOptional()
  @IsIn([
    CommissionTxnStatus.PENDING,
    CommissionTxnStatus.APPROVED,
    CommissionTxnStatus.PAID,
    CommissionTxnStatus.POSTED,
  ])
  status?: CommissionTxnStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class ApproveTransactionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  ids!: string[];
}

export class CreateMiddlemanPayoutDto {
  @IsString()
  middlemanId!: string;

  @IsISO8601()
  periodStart!: string;

  @IsISO8601()
  periodEnd!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
