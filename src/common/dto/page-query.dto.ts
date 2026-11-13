import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export function pageArgs(query: PageQueryDto) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  return { page, limit, skip: (page - 1) * limit };
}

export function dateRange(query: PageQueryDto): Record<string, Date> | undefined {
  if (!query.from && !query.to) return undefined;
  const range: Record<string, Date> = {};
  if (query.from) range.$gte = new Date(query.from);
  if (query.to) range.$lte = new Date(query.to);
  return range;
}
