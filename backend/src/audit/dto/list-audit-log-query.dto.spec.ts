import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ALL_EVENT_TYPES } from '../../events/event-types';
import { ListAuditLogQueryDto } from './list-audit-log-query.dto';

async function check(plain: object) {
  const dto = plainToInstance(ListAuditLogQueryDto, plain);
  return { dto, errors: (await validate(dto)).map((e) => e.property) };
}

describe('ListAuditLogQueryDto', () => {
  it('defaults to the first page of 10 with no filters', async () => {
    const { dto, errors } = await check({});
    expect(errors).toEqual([]);
    expect(dto).toMatchObject({ page: 1, limit: 10 });
    expect(dto.type).toBeUndefined();
    expect(dto.correlationId).toBeUndefined();
    expect(dto.requestId).toBeUndefined();
  });

  it('accepts all filters together and converts paging to numbers', async () => {
    const { dto, errors } = await check({
      page: '2',
      limit: '100',
      type: 'travel.vacation-request.approved',
      correlationId: 'req_1.a-B',
      requestId: '9b2c7d4e-1111-4222-8333-444444444444',
    });
    expect(errors).toEqual([]);
    expect(dto).toMatchObject({ page: 2, limit: 100 });
  });

  it.each(ALL_EVENT_TYPES)('accepts the event type %s', async (type) => {
    expect((await check({ type })).errors).toEqual([]);
  });

  it.each([
    ['an unknown event type', { type: 'travel.test.ping' }, 'type'],
    ['a correlation id with spaces', { correlationId: 'req 1' }, 'correlationId'],
    [
      'a correlation id longer than 128 characters',
      { correlationId: 'a'.repeat(129) },
      'correlationId',
    ],
    ['an empty correlation id', { correlationId: '' }, 'correlationId'],
    ['a request id that is not a uuid', { requestId: 'r-1' }, 'requestId'],
    ['a limit above 100', { limit: '101' }, 'limit'],
    ['page 0', { page: '0' }, 'page'],
  ])('rejects %s', async (_label, plain, property) => {
    expect((await check(plain)).errors).toEqual([property]);
  });

  it('accepts a correlation id of exactly 128 characters', async () => {
    expect((await check({ correlationId: 'a'.repeat(128) })).errors).toEqual([]);
  });
});
