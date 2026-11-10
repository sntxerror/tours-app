import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { VacationEventsPublisher } from './vacation-events.publisher';
import type { VacationRequest } from './vacation-request.entity';
import { VacationExpiryService } from './vacation-expiry.service';

const row = (id: string) => ({
  id,
  userId: 'u-1',
  startDate: '2030-01-01',
  endDate: '2030-01-05',
  expiredAt: new Date('2030-01-06T00:00:00Z'),
});

function setup(claimed: ReturnType<typeof row>[] = [], config: Record<string, unknown> = {}) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of ['update', 'set', 'where', 'andWhere', 'returning']) qb[m] = jest.fn(() => qb);
  qb.execute = jest.fn().mockResolvedValue({ raw: claimed.map(({ id }) => ({ id })) });
  const findBy = jest.fn().mockResolvedValue(claimed);
  const em = { createQueryBuilder: jest.fn(() => qb), getRepository: jest.fn(() => ({ findBy })) };
  const transaction = jest.fn(async (work: (m: typeof em) => Promise<unknown>) => work(em));
  const recordExpired = jest.fn().mockResolvedValue(undefined);
  const service = new VacationExpiryService(
    { manager: { transaction } } as unknown as Repository<VacationRequest>,
    { expired: recordExpired } as unknown as VacationEventsPublisher,
    { get: (key: string) => config[key] } as unknown as ConfigService,
  );
  return { service, qb, em, findBy, transaction, recordExpired };
}

describe('VacationExpiryService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('claims only Pending, not-yet-expired requests that started before today', async () => {
    const { service, qb } = setup();
    await service.expireOverdue('2030-06-15');

    expect(qb.where).toHaveBeenCalledWith('status = :status', { status: 'Pending' });
    expect(qb.andWhere).toHaveBeenCalledWith('expired_at IS NULL');
    expect(qb.andWhere).toHaveBeenCalledWith('start_date < :today', { today: '2030-06-15' });
    expect(qb.returning).toHaveBeenCalledWith(['id']);
  });

  it('marks and records in ONE transaction, so the marker and the event cannot diverge', async () => {
    const { service, transaction, em, recordExpired } = setup([row('a'), row('b')]);

    await expect(service.expireOverdue()).resolves.toBe(2);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(recordExpired).toHaveBeenCalledTimes(2);
    expect(recordExpired).toHaveBeenCalledWith(row('a'), em);
    expect(recordExpired).toHaveBeenCalledWith(row('b'), em);
  });

  it('reloads the claimed rows through the entity (dates stay YYYY-MM-DD strings)', async () => {
    const { service, findBy } = setup([row('a')]);
    await service.expireOverdue();
    expect(findBy).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no request is overdue', async () => {
    const { service, recordExpired, findBy } = setup([]);
    await expect(service.expireOverdue()).resolves.toBe(0);
    expect(recordExpired).not.toHaveBeenCalled();
    expect(findBy).not.toHaveBeenCalled();
  });

  it('fails the whole run when an event cannot be recorded, so nothing is marked expired', async () => {
    const { service, recordExpired } = setup([row('a'), row('b')]);
    recordExpired.mockRejectedValueOnce(new Error('outbox insert failed'));
    // The transaction callback throws, which makes the real database roll the markers back too.
    await expect(service.expireOverdue()).rejects.toThrow('outbox insert failed');
  });

  describe('scheduling', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('runs at startup and then on the configured interval, and stops on shutdown', async () => {
      const { service, qb } = setup([], { VACATION_EXPIRY_INTERVAL_SECONDS: '60' });
      service.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(0);
      expect(qb.execute).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(60_000);
      expect(qb.execute).toHaveBeenCalledTimes(2);

      service.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(120_000);
      expect(qb.execute).toHaveBeenCalledTimes(2);
    });

    it('is disabled when the interval is 0', async () => {
      const { service, qb } = setup([], { VACATION_EXPIRY_INTERVAL_SECONDS: '0' });
      service.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(10_000);
      expect(qb.execute).not.toHaveBeenCalled();
    });

    it('logs and survives a failing run, then keeps its schedule', async () => {
      const { service, qb } = setup([], { VACATION_EXPIRY_INTERVAL_SECONDS: '60' });
      qb.execute.mockRejectedValueOnce(new Error('db down'));
      const error = jest.spyOn(Logger.prototype, 'error');

      service.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(0);
      expect(error).toHaveBeenCalledWith('Expiry run failed: db down');

      await jest.advanceTimersByTimeAsync(60_000);
      expect(qb.execute).toHaveBeenCalledTimes(2);
      service.onModuleDestroy();
    });

    it('gives each scheduled run its own correlation id for the events it records', async () => {
      const { service, recordExpired } = setup([row('a')], {
        VACATION_EXPIRY_INTERVAL_SECONDS: '60',
      });
      const seen: (string | undefined)[] = [];
      const { getRequestContext } = jest.requireActual(
        '../common/request-context/request-context',
      ) as typeof import('../common/request-context/request-context');
      recordExpired.mockImplementation(async () => {
        seen.push(getRequestContext()?.correlationId);
      });

      service.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(60_000);
      service.onModuleDestroy();

      expect(seen.length).toBe(2);
      expect(seen[0]).toMatch(/^[0-9a-f-]{36}$/);
      expect(seen[0]).not.toBe(seen[1]);
    });
  });
});
