import type { PaginationQueryDto } from './pagination-query.dto';

export interface Page<T> {
  items: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export function toPage<T>(items: T[], total: number, { page, limit }: PaginationQueryDto): Page<T> {
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
