import type { EntityManager, Repository } from 'typeorm';
import { runWithRequestContext } from '../../common/request-context/request-context';
import { UserRole } from '../../users/user-role.enum';
import { VacationStatus } from '../../vacation-requests/vacation-status.enum';
import { SYSTEM_ACTOR, userActor } from '../event-envelope';
import { VacationEvent } from '../event-types';
import { OutboxEvent } from './outbox-event.entity';
import { OutboxService } from './outbox.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const snapshot = {
  requestId: 'r-1',
  userId: 'u-1',
  startDate: '2030-01-01',
  endDate: '2030-01-05',
  status: VacationStatus.Pending,
};

function setup() {
  const defaultInsert = jest.fn().mockResolvedValue(undefined);
  const service = new OutboxService({
    manager: { insert: defaultInsert },
  } as unknown as Repository<OutboxEvent>);
  const inserted = (insert: jest.Mock = defaultInsert, call = 0) =>
    insert.mock.calls[call][1] as Partial<OutboxEvent>;
  return { service, defaultInsert, inserted };
}

describe('OutboxService', () => {
  it('inserts a row describing the event through the default manager', async () => {
    const { service, defaultInsert, inserted } = setup();
    const before = Date.now();

    await service.record(VacationEvent.Submitted, snapshot, SYSTEM_ACTOR);

    expect(defaultInsert).toHaveBeenCalledTimes(1);
    expect(defaultInsert.mock.calls[0][0]).toBe(OutboxEvent);
    const row = inserted();
    expect(row).toEqual({
      id: expect.stringMatching(UUID),
      type: VacationEvent.Submitted,
      actor: SYSTEM_ACTOR,
      correlationId: expect.stringMatching(UUID),
      data: snapshot,
      occurredAt: expect.any(Date),
    });
    expect(row.occurredAt!.getTime()).toBeGreaterThanOrEqual(before);
    expect(row.occurredAt!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("uses the caller's transaction manager instead of the default one", async () => {
    const { service, defaultInsert, inserted } = setup();
    const txInsert = jest.fn().mockResolvedValue(undefined);
    const actor = userActor({ id: 'u-1', role: UserRole.Requester });

    await service.record(VacationEvent.Cancelled, snapshot, actor, {
      insert: txInsert,
    } as unknown as EntityManager);

    expect(defaultInsert).not.toHaveBeenCalled();
    expect(txInsert).toHaveBeenCalledWith(OutboxEvent, expect.anything());
    expect(inserted(txInsert)).toMatchObject({ type: VacationEvent.Cancelled, actor });
  });

  it('takes the correlation id from the request context', async () => {
    const { service, inserted } = setup();

    await runWithRequestContext({ correlationId: 'req-42' }, () =>
      service.record(VacationEvent.Submitted, snapshot, SYSTEM_ACTOR),
    );

    expect(inserted().correlationId).toBe('req-42');
  });

  it('gives every event its own id and, outside a request, its own correlation id', async () => {
    const { service, inserted } = setup();

    await service.record(VacationEvent.Submitted, snapshot, SYSTEM_ACTOR);
    await service.record(VacationEvent.Submitted, snapshot, SYSTEM_ACTOR);

    const [first, second] = [inserted(undefined, 0), inserted(undefined, 1)];
    expect(first.id).toMatch(UUID);
    expect(second.id).toMatch(UUID);
    expect(first.id).not.toBe(second.id);
    expect(first.correlationId).not.toBe(second.correlationId);
    expect(first.id).not.toBe(first.correlationId);
  });

  it('propagates insert failures so the surrounding transaction rolls back', async () => {
    const { service, defaultInsert } = setup();
    defaultInsert.mockRejectedValueOnce(new Error('db down'));

    await expect(service.record(VacationEvent.Submitted, snapshot, SYSTEM_ACTOR)).rejects.toThrow(
      'db down',
    );
  });
});
