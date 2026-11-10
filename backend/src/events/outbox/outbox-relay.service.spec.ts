import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { LessThan, type Repository } from 'typeorm';
import { SYSTEM_ACTOR } from '../event-envelope';
import { type EventPublisherService, EventRejectedError } from '../event-publisher.service';
import { VacationEvent } from '../event-types';
import { OutboxEvent } from './outbox-event.entity';
import {
  OUTBOX_BATCH_SIZE,
  OUTBOX_MAX_REJECTIONS,
  OutboxRelayService,
} from './outbox-relay.service';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const row = (id: string, over: Partial<OutboxEvent> = {}): OutboxEvent => ({
  id,
  type: VacationEvent.Submitted,
  actor: SYSTEM_ACTOR,
  correlationId: `corr-${id}`,
  data: { requestId: `r-${id}` },
  occurredAt: new Date('2030-01-01T00:00:00.000Z'),
  publishedAt: null,
  attempts: 0,
  lastError: null,
  ...over,
});

const rowsOf = (n: number) => Array.from({ length: n }, (_, i) => row(`id-${i}`));

function setup(rows: OutboxEvent[] = [], config: Record<string, unknown> = {}) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of [
    'setLock',
    'setOnLocked',
    'where',
    'andWhere',
    'orderBy',
    'addOrderBy',
    'limit',
  ]) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getMany = jest.fn().mockResolvedValue(rows);
  const txRepo = {
    createQueryBuilder: jest.fn(() => qb),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const em = { getRepository: jest.fn(() => txRepo) };
  const transaction = jest.fn((work: (manager: typeof em) => Promise<unknown>) => work(em));
  const outbox = {
    manager: { transaction },
    delete: jest.fn().mockResolvedValue({ affected: 0 }),
  };
  const send = jest.fn().mockResolvedValue(undefined);
  const service = new OutboxRelayService(
    outbox as unknown as Repository<OutboxEvent>,
    { send } as unknown as EventPublisherService,
    { get: (key: string) => config[key] } as unknown as ConfigService,
  );
  return { service, qb, txRepo, em, transaction, outbox, send };
}

const sqlOf = (value: unknown) => (value as () => string)();

describe('OutboxRelayService', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('drain', () => {
    it('claims unsent, non-parked rows oldest first, skipping rows locked by another instance', async () => {
      const { service, qb, em, transaction } = setup();

      await expect(service.drain()).resolves.toEqual({ claimed: 0, sent: 0 });

      expect(transaction).toHaveBeenCalledTimes(1);
      expect(em.getRepository).toHaveBeenCalledWith(OutboxEvent);
      expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
      expect(qb.setOnLocked).toHaveBeenCalledWith('skip_locked');
      expect(qb.where).toHaveBeenCalledWith('event.publishedAt IS NULL');
      expect(qb.andWhere).toHaveBeenCalledWith('event.attempts < :max', {
        max: OUTBOX_MAX_REJECTIONS,
      });
      expect(qb.orderBy).toHaveBeenCalledWith('event.occurredAt', 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('event.id', 'ASC');
      expect(qb.limit).toHaveBeenCalledWith(OUTBOX_BATCH_SIZE);
    });

    it('sends each row as a stable envelope, in order, and marks it published', async () => {
      const a = row('a', { occurredAt: new Date('2030-01-01T10:00:00.000Z') });
      const b = row('b', { type: VacationEvent.Approved });
      const { service, send, txRepo } = setup([a, b]);

      await expect(service.drain()).resolves.toEqual({ claimed: 2, sent: 2 });

      expect(send.mock.calls.map(([envelope]) => envelope)).toEqual([
        {
          eventId: 'a',
          schemaVersion: 1,
          occurredAt: '2030-01-01T10:00:00.000Z',
          source: 'travel-app.api',
          type: VacationEvent.Submitted,
          correlationId: 'corr-a',
          actor: SYSTEM_ACTOR,
          data: { requestId: 'r-a' },
        },
        expect.objectContaining({ eventId: 'b', type: VacationEvent.Approved }),
      ]);
      expect(txRepo.update).toHaveBeenCalledTimes(2);
      expect(txRepo.update.mock.calls.map(([where]) => where)).toEqual([{ id: 'a' }, { id: 'b' }]);
      const changes = txRepo.update.mock.calls[0][1];
      expect(changes).toEqual({ publishedAt: expect.any(Function), lastError: null });
      expect(sqlOf(changes.publishedAt)).toBe('now()');
    });

    it('marks a row published only after the bus accepted it', async () => {
      const { service, send, txRepo } = setup([row('a')]);
      send.mockImplementationOnce(async () => {
        expect(txRepo.update).not.toHaveBeenCalled();
      });

      await service.drain();
      expect(txRepo.update).toHaveBeenCalledTimes(1);
    });

    it('counts a rejection against that row only and carries on with the rest', async () => {
      const { service, send, txRepo } = setup([row('a', { attempts: 1 }), row('b')]);
      send.mockRejectedValueOnce(new EventRejectedError('PutEvents failed: Bad Detail'));

      await expect(service.drain()).resolves.toEqual({ claimed: 2, sent: 1 });

      expect(send).toHaveBeenCalledTimes(2);
      expect(txRepo.update).toHaveBeenCalledTimes(2);
      const [where, changes] = txRepo.update.mock.calls[0];
      expect(where).toEqual({ id: 'a' });
      expect(changes).toEqual({
        attempts: expect.any(Function),
        lastError: 'PutEvents failed: Bad Detail',
      });
      expect(sqlOf(changes.attempts)).toBe('attempts + 1');
      expect(txRepo.update.mock.calls[1][0]).toEqual({ id: 'b' });
      expect(txRepo.update.mock.calls[1][1]).toMatchObject({ lastError: null });

      expect(error).toHaveBeenCalledTimes(1);
      const line = error.mock.calls[0][0] as string;
      expect(line).toContain(`${VacationEvent.Submitted} a`);
      expect(line).toContain('PutEvents failed: Bad Detail');
      expect(line).not.toContain('parking');
    });

    it('parks a row once it reaches the rejection limit', async () => {
      const { service, send } = setup([row('a', { attempts: OUTBOX_MAX_REJECTIONS - 1 })]);
      send.mockRejectedValueOnce(new EventRejectedError('still bad'));

      await expect(service.drain()).resolves.toEqual({ claimed: 1, sent: 0 });

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('parking it for manual attention'),
      );
    });

    it('stops the pass and leaves rows untouched when the bus is unreachable', async () => {
      const { service, send, txRepo } = setup([row('a'), row('b'), row('c')]);
      send.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      await expect(service.drain()).resolves.toEqual({ claimed: 3, sent: 0 });

      expect(send).toHaveBeenCalledTimes(1);
      expect(txRepo.update).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith('Bus unreachable, 3 event(s) stay queued: ECONNREFUSED');
    });

    it('keeps what was sent before the bus became unreachable', async () => {
      const { service, send, txRepo } = setup([row('a'), row('b'), row('c')]);
      send.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('timeout'));

      await expect(service.drain()).resolves.toEqual({ claimed: 3, sent: 1 });

      expect(send).toHaveBeenCalledTimes(2);
      expect(txRepo.update).toHaveBeenCalledTimes(1);
      expect(txRepo.update.mock.calls[0][0]).toEqual({ id: 'a' });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('2 event(s) stay queued'));
    });

    it('fails (rolling the transaction back) when the claim query fails', async () => {
      const { service, qb, send } = setup();
      qb.getMany.mockRejectedValueOnce(new Error('db down'));

      await expect(service.drain()).rejects.toThrow('db down');
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('scheduling', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it.each(['0', '-1', 0])('is disabled when OUTBOX_POLL_INTERVAL_MS is %p', async (interval) => {
      const { service, transaction } = setup([], { OUTBOX_POLL_INTERVAL_MS: interval });

      service.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(60_000);

      expect(transaction).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Outbox relay disabled'));
    });

    it('a disabled relay does not publish on shutdown either', async () => {
      const { service, transaction } = setup([], { OUTBOX_POLL_INTERVAL_MS: '0' });
      service.onApplicationBootstrap();
      await service.onModuleDestroy();
      expect(transaction).not.toHaveBeenCalled();
    });

    it('drains right away and then every second by default', async () => {
      const { service, transaction } = setup();

      service.onApplicationBootstrap();
      expect(transaction).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(0);
      expect(transaction).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(999);
      expect(transaction).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(transaction).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(3_000);
      expect(transaction).toHaveBeenCalledTimes(5);

      await service.onModuleDestroy();
    });

    it('uses the configured poll interval', async () => {
      const { service, transaction } = setup([], { OUTBOX_POLL_INTERVAL_MS: '250' });

      service.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(249);
      expect(transaction).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(1);
      expect(transaction).toHaveBeenCalledTimes(2);

      await service.onModuleDestroy();
    });

    it('keeps going without pausing after a full batch', async () => {
      const { service, qb, transaction } = setup();
      qb.getMany.mockResolvedValueOnce(rowsOf(OUTBOX_BATCH_SIZE)).mockResolvedValue([]);

      service.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(10);

      expect(transaction).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(900);
      expect(transaction).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(200);
      expect(transaction).toHaveBeenCalledTimes(3);

      await service.onModuleDestroy();
    });

    it.each([
      ['a partial batch', OUTBOX_BATCH_SIZE - 1, false],
      ['a full batch with a rejected row', OUTBOX_BATCH_SIZE, true],
    ])('waits the interval after %s', async (_label, count, reject) => {
      const { service, qb, send, transaction } = setup();
      qb.getMany.mockResolvedValueOnce(rowsOf(count)).mockResolvedValue([]);
      if (reject) send.mockRejectedValueOnce(new EventRejectedError('bad'));

      service.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(10);
      expect(transaction).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(990);
      expect(transaction).toHaveBeenCalledTimes(2);

      await service.onModuleDestroy();
    });

    it('logs a failed run and tries again on the next interval', async () => {
      const { service, transaction } = setup();
      transaction.mockRejectedValueOnce(new Error('db down'));

      service.onApplicationBootstrap();
      await jest.advanceTimersByTimeAsync(0);
      expect(warn).toHaveBeenCalledWith('Outbox relay run failed: db down');

      await jest.advanceTimersByTimeAsync(1_000);
      expect(transaction).toHaveBeenCalledTimes(2);

      await service.onModuleDestroy();
    });

    describe('purge of published rows', () => {
      const NOW = new Date('2030-06-15T12:00:00.000Z').getTime();
      beforeEach(() => jest.setSystemTime(NOW));

      it('deletes rows published more than 7 days ago on the first run', async () => {
        const { service, outbox } = setup();
        outbox.delete.mockResolvedValueOnce({ affected: 3 });

        service.onApplicationBootstrap();
        await jest.advanceTimersByTimeAsync(0);

        expect(outbox.delete).toHaveBeenCalledTimes(1);
        expect(outbox.delete).toHaveBeenCalledWith({
          publishedAt: LessThan(new Date(NOW - 7 * DAY_MS)),
        });
        expect(log).toHaveBeenCalledWith('Purged 3 published outbox row(s) older than 7 day(s)');

        await service.onModuleDestroy();
      });

      it('uses OUTBOX_RETENTION_DAYS and stays quiet when nothing was purged', async () => {
        const { service, outbox } = setup([], { OUTBOX_RETENTION_DAYS: '2' });

        service.onApplicationBootstrap();
        await jest.advanceTimersByTimeAsync(0);

        expect(outbox.delete).toHaveBeenCalledWith({
          publishedAt: LessThan(new Date(NOW - 2 * DAY_MS)),
        });
        expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Purged'));

        await service.onModuleDestroy();
      });

      it('purges at most once an hour', async () => {
        const interval = HOUR_MS / 2;
        const { service, outbox, transaction } = setup([], {
          OUTBOX_POLL_INTERVAL_MS: String(interval),
        });

        service.onApplicationBootstrap();
        await jest.advanceTimersByTimeAsync(0);
        expect(outbox.delete).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(interval);
        expect(transaction).toHaveBeenCalledTimes(2);
        expect(outbox.delete).toHaveBeenCalledTimes(1);

        await jest.advanceTimersByTimeAsync(interval);
        expect(transaction).toHaveBeenCalledTimes(3);
        expect(outbox.delete).toHaveBeenCalledTimes(2);

        await service.onModuleDestroy();
      });

      it('does not purge when the drain failed', async () => {
        const { service, outbox, transaction } = setup();
        transaction.mockRejectedValueOnce(new Error('db down'));

        service.onApplicationBootstrap();
        await jest.advanceTimersByTimeAsync(0);
        expect(outbox.delete).not.toHaveBeenCalled();

        await jest.advanceTimersByTimeAsync(1_000);
        expect(outbox.delete).toHaveBeenCalledTimes(1);

        await service.onModuleDestroy();
      });
    });

    describe('shutdown', () => {
      it('stops polling and flushes what is pending one last time', async () => {
        const { service, qb, send, transaction } = setup();
        service.onApplicationBootstrap();
        await jest.advanceTimersByTimeAsync(0);
        expect(transaction).toHaveBeenCalledTimes(1);

        qb.getMany.mockResolvedValueOnce([row('late')]);
        await service.onModuleDestroy();

        expect(transaction).toHaveBeenCalledTimes(2);
        expect(send).toHaveBeenCalledWith(expect.objectContaining({ eventId: 'late' }));

        await jest.advanceTimersByTimeAsync(60_000);
        expect(transaction).toHaveBeenCalledTimes(2);
      });

      it('waits for an in-flight run before the final flush', async () => {
        const { service, qb, send, transaction } = setup();
        let release!: () => void;
        send.mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              release = resolve;
            }),
        );
        qb.getMany.mockResolvedValueOnce([row('a')]).mockResolvedValue([]);

        service.onApplicationBootstrap();
        await jest.advanceTimersByTimeAsync(0);
        expect(send).toHaveBeenCalledTimes(1);

        let done = false;
        const destroying = service.onModuleDestroy().then(() => {
          done = true;
        });
        await jest.advanceTimersByTimeAsync(0);
        expect(done).toBe(false);
        expect(transaction).toHaveBeenCalledTimes(1);

        release();
        await destroying;
        expect(transaction).toHaveBeenCalledTimes(2);

        await jest.advanceTimersByTimeAsync(60_000);
        expect(transaction).toHaveBeenCalledTimes(2);
      });

      it('logs and swallows a failing final flush', async () => {
        const { service, transaction } = setup();
        service.onApplicationBootstrap();
        transaction.mockRejectedValueOnce(new Error('db gone'));

        await expect(service.onModuleDestroy()).resolves.toBeUndefined();
        expect(warn).toHaveBeenCalledWith('Final outbox flush failed: db gone');
      });

      it('gives up on a final flush that hangs after 5 seconds', async () => {
        const { service, transaction } = setup();
        service.onApplicationBootstrap();
        transaction.mockImplementationOnce(() => new Promise(() => undefined));

        let done = false;
        const destroying = service.onModuleDestroy().then(() => {
          done = true;
        });
        await jest.advanceTimersByTimeAsync(4_999);
        expect(done).toBe(false);
        await jest.advanceTimersByTimeAsync(1);
        await destroying;
        expect(done).toBe(true);
      });
    });
  });
});
