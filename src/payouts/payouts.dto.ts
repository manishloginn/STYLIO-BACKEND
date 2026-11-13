import { IsInt, IsISO8601, IsOptional, IsString, Min } from 'class-validator';

export class CreatePayoutDto {
  @IsString()
  salonId!: string;

  @IsISO8601()
  periodStart!: string;

  @IsISO8601()
  periodEnd!: string;

  @IsInt()
  @Min(0)
  reservePaise!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
