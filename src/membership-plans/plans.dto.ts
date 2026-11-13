import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PlanSource, PlanStatus, PlanType } from '../common/enums';

export class PlanItemDto {
  @IsString()
  serviceId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantityLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  valueDeduction?: number;

  @IsOptional()
  @IsBoolean()
  excluded?: boolean;
}

export class UpsertPlanDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(PlanType)
  planType!: PlanType;

  @IsEnum(PlanSource)
  planSource!: PlanSource;

  @IsOptional()
  @IsString()
  externalPlanId?: string;

  @IsInt()
  @Min(0)
  sellingPrice!: number;

  @IsInt()
  @Min(1)
  validityDays!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  serviceValueLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountPercentage?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  discountCap?: number;

  @IsOptional()
  @IsBoolean()
  stackingAllowed?: boolean;

  @IsString()
  @MinLength(2)
  terms!: string;

  @IsOptional()
  @IsString()
  restrictions?: string;

  @IsArray()
  @IsString({ each: true })
  branchIds!: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PlanItemDto)
  items!: PlanItemDto[];
}

export class PlanDecisionDto {
  @IsEnum(PlanStatus)
  status!: PlanStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CompareQueryDto {
  @IsString()
  ids!: string;
}
