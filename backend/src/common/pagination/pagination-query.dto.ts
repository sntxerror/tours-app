import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

/** Shared `?page=&limit=` query parameters. Extend it for list endpoints that add filters. */
export class PaginationQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;
}
