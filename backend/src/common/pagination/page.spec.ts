import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { toPage } from './page';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PaginationQueryDto } from './pagination-query.dto';

describe('toPage', () => {
  it('computes totalPages by rounding up', () => {
    expect(toPage(['a'], 21, { page: 3, limit: 10 }).meta).toEqual({
      page: 3,
      limit: 10,
      total: 21,
      totalPages: 3,
    });
  });

  it('reports zero pages for an empty result', () => {
    expect(toPage([], 0, { page: 1, limit: 10 })).toEqual({
      items: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
  });

  it('reports one page when the total equals the limit', () => {
    expect(toPage([1], 10, { page: 1, limit: 10 }).meta.totalPages).toBe(1);
  });
});

describe('PaginationQueryDto', () => {
  const check = async (query: Record<string, unknown>) => {
    const dto = plainToInstance(PaginationQueryDto, query);
    return { dto, errors: await validate(dto) };
  };

  it('defaults to page 1 and the default page size', async () => {
    const { dto, errors } = await check({});
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 1, limit: DEFAULT_PAGE_SIZE });
  });

  it('converts query strings to numbers', async () => {
    const { dto, errors } = await check({ page: '2', limit: '5' });
    expect(errors).toHaveLength(0);
    expect(dto).toMatchObject({ page: 2, limit: 5 });
  });

  it('accepts the maximum limit', async () => {
    expect(await check({ limit: String(MAX_PAGE_SIZE) })).toMatchObject({ errors: [] });
  });

  it.each([
    { page: '0' },
    { page: '-1' },
    { page: '1.5' },
    { page: 'abc' },
    { limit: '0' },
    { limit: String(MAX_PAGE_SIZE + 1) },
  ])('rejects %p', async (query) => {
    expect((await check(query)).errors.length).toBeGreaterThan(0);
  });
});
