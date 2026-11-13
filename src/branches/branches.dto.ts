import { IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { BranchStatus } from '../common/enums';

export class CreateBranchDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  address!: string;

  @IsString()
  city!: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class BranchDecisionDto {
  @IsEnum(BranchStatus)
  status!: BranchStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
