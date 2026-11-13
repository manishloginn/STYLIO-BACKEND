import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateServiceDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  category!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  retailPrice!: number;
}

export class UpdateServiceDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  retailPrice?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
