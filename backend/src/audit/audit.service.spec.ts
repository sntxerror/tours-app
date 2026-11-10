import type { Repository } from 'typeorm';
import type { EventEnvelope } from '../events/event-envelope';
import { AuthEvent, VacationEvent } from '../events/event-types';
import type { AuditLog } from './audit-log.entity';
import { AuditService } from './audit.service';
import type { ListAuditLogQueryDto } from './dto/list-audit-log-query.dto';

const envelope: EventEnvelope = {
  eventId: '3f2a9c1e-aaaa-bbbb-cccc-000000000000',
  schemaVersion: 1,
  occurredAt: '2030-01-01T10:00:00.000Z',
  source: 'travel-app.api',
  type: VacationEvent.Approved,
  correlationId: 'req-1',
  actor: { type: 'user', id: 'u-1', role: 'Validator' as never },
  data: { requestId: 'r-1' },
};

function setup(raw: unknown[] = [{ event_id: envelope.eventId }]) {
  const insert: Record<string, jest.Mock> = {};
  for (const m of ['insert', 'values', 'orIgnore', 'returning']) insert[m] = jest.fn(() => insert);
  insert.execute = jest.fn().mockResolvedValue({ raw });

  const items = [{ eventId: 'e-1' }] as AuditLog[];
  const list: Record<string, jest.Mock> = {};
  for (const m of ['where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take']) {
    list[m] = jest.fn(() => list);
  }
  list.getManyAndCount = jest.fn().mockResolvedValue([items, 21]);

  const createQueryBuilder = jest.fn((alias?: string) => (alias ? list : insert));
  const service = new AuditService({ createQueryBuilder } as unknown as Repository<AuditLog>);
  return { service, insert, list, items, createQueryBuilder };
}

const query = (over: Partial<ListAuditLogQueryDto> = {}) =>
  ({ page: 1, limit: 10, ...over }) as ListAuditLogQueryDto;

describe('AuditService', () => {
  describe('record', () => {
    it('inserts the event keyed by its id, ignoring duplicates', async () => {
      const { service, insert } = setup();

      await expect(service.record(envelope)).resolves.toBe(true);

      expect(insert.values).toHaveBeenCalledWith({
        eventId: envelope.eventId,
        type: envelope.type,
        occurredAt: new Date('2030-01-01T10:00:00.000Z'),
        actor: envelope.actor,
        correlationId: 'req-1',
        data: { requestId: 'r-1' },
      });
      expect(insert.orIgnore).toHaveBeenCalled();
      expect(insert.returning).toHaveBeenCalledWith(['eventId']);
      expect(insert.execute).toHaveBeenCalledTimes(1);
    });

    it('reports a redelivered event (no row returned) as not written', async () => {
      const { service } = setup([]);
      await expect(service.record(envelope)).resolves.toBe(false);
    });

    it('propagates database errors so the message is redelivered', async () => {
      const { service, insert } = setup();
      insert.execute.mockRejectedValueOnce(new Error('db down'));
      await expect(service.record(envelope)).rejects.toThrow('db down');
    });
  });

  describe('list', () => {
    it('returns a newest-first page with metadata', async () => {
      const { service, list, items, createQueryBuilder } = setup();

      await expect(service.list(query({ page: 3, limit: 10 }))).resolves.toEqual({
        items,
        meta: { page: 3, limit: 10, total: 21, totalPages: 3 },
      });

      expect(createQueryBuilder).toHaveBeenCalledWith('entry');
      expect(list.orderBy).toHaveBeenCalledWith('entry.occurredAt', 'DESC');
      expect(list.addOrderBy).toHaveBeenCalledWith('entry.eventId', 'ASC');
      expect(list.skip).toHaveBeenCalledWith(20);
      expect(list.take).toHaveBeenCalledWith(10);
    });

    it('applies no filter when none is given', async () => {
      const { service, list } = setup();
      await service.list(query());
      expect(list.andWhere).not.toHaveBeenCalled();
      expect(list.skip).toHaveBeenCalledWith(0);
    });

    it('filters by type, correlation id and vacation request', async () => {
      const { service, list } = setup();
      const requestId = '9b2c7d4e-1111-4222-8333-444444444444';

      await service.list(
        query({ type: AuthEvent.LoginFailed, correlationId: 'req-9', requestId, limit: 5 }),
      );

      expect(list.andWhere).toHaveBeenCalledTimes(3);
      expect(list.andWhere).toHaveBeenCalledWith('entry.type = :type', {
        type: AuthEvent.LoginFailed,
      });
      expect(list.andWhere).toHaveBeenCalledWith('entry.correlationId = :correlationId', {
        correlationId: 'req-9',
      });
      expect(list.andWhere).toHaveBeenCalledWith("entry.data ->> 'requestId' = :requestId", {
        requestId,
      });
      expect(list.take).toHaveBeenCalledWith(5);
    });

    it('applies only the filters given', async () => {
      const { service, list } = setup();
      await service.list(query({ correlationId: 'req-9' }));
      expect(list.andWhere).toHaveBeenCalledTimes(1);
      expect(list.andWhere).toHaveBeenCalledWith('entry.correlationId = :correlationId', {
        correlationId: 'req-9',
      });
    });
  });
});
