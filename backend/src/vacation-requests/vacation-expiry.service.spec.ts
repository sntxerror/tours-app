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
  const requests = {
    createQueryBuilder: jest.fn(() => qb),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    findBy: jest.fn().mockResolvedValue(claimed),
  };
  const expired = jest.fn().mockResolvedValue(undefined);
  const service = new VacationExpiryService(
    requests as unknown as Repository<VacationRequest>,
    { expired } as unknown as VacationEventsPublisher,
    { get: (key: string) => config[key] } as unknown as ConfigService,
  );
  return { service, qb, requests, expired };
}

describe('VacationExpiryService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('claims only Pending, not-yet-expired requests that started before today', async () => {
    const { service, qb } = setup();
    await service.expireOverdue('2030-06-15');

    expect(qb.where).toHaveBeenCalledWith('status = :status', { status: 'Pending' });
    expect(qb.andWhere).toHaveBeenCalledWith('expired_at IS NULL');
    expect(qb.andWhere).toHaveBeenCalledWith('start_date < :today', { today: '2030-06-15' });
  });

  it('announces each claimed request once and returns the count', async () => {
    const { service, expired } = setup([row('a'), row('b')]);

    await expect(service.expireOverdue()).resolves.toBe(2);
    expect(expired).toHaveBeenCalledTimes(2);
    expect(expired).toHaveBeenCalledWith(row('a'));
  });

  it('does nothing when no request is overdue', async () => {
    const { service, expired, requests } = setup([]);
    await expect(service.expireOverdue()).resolves.toBe(0);
    expect(expired).not.toHaveBeenCalled();
    expect(requests.findBy).not.toHaveBeenCalled();
  });

  it('releases the claim when publishing fails so the next run retries, and keeps going', async () => {
    const { service, expired, requests } = setup([row('a'), row('b')]);
    expired.mockRejectedValueOnce(new Error('bus down'));

    await expect(service.expireOverdue()).resolves.toBe(1);
    expect(requests.update).toHaveBeenCalledTimes(1);
    expect(requests.update).toHaveBeenCalledWith({ id: 'a' }, { expiredAt: null });
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
  });
});
