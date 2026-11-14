import { IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateRuleDto {
  @IsOptional()
  @IsString()
  salonId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  rateBps?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  baseRateBps?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  middlemanRateBps?: number;

  @IsOptional()
  @IsString()
  middlemanId?: string;

  @IsISO8601()
  effectiveFrom!: string;

  @IsOptional()
  @IsISO8601()
  effectiveTo?: string;
}
