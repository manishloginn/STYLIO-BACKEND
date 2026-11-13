import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { SALON_PERMISSIONS, SalonPermission, SalonStatus, SalonType } from '../common/enums';
import { PageQueryDto } from '../common/dto/page-query.dto';

export class CreateSalonDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  description!: string;

  @IsEnum(SalonType)
  salonType!: SalonType;

  @IsString()
  city!: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  gallery?: string[];
}

export class UpdateSalonDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(SalonType)
  salonType?: SalonType;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  gallery?: string[];
}

export class DiscoverQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsIn(['true', 'false'])
  hasMembership?: string;

  @IsOptional()
  @IsEnum(SalonType)
  salonType?: SalonType;

  @IsOptional()
  @IsIn(['newest', 'name', 'price'])
  sort?: 'newest' | 'name' | 'price';
}

export class AddStaffDto {
  @IsString()
  name!: string;

  @IsString()
  phone!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsArray()
  @IsIn(SALON_PERMISSIONS, { each: true })
  permissions!: SalonPermission[];
}

export class DecisionDto {
  @IsEnum(SalonStatus)
  status!: SalonStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
