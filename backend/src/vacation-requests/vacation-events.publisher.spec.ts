import type { EntityManager } from 'typeorm';
import { SYSTEM_ACTOR } from '../events/event-envelope';
import { VacationEvent } from '../events/event-types';
import type { OutboxService } from '../events/outbox/outbox.service';
import { VacationEventsPublisher } from './vacation-events.publisher';
import type { VacationRequest } from './vacation-request.entity';
import { VacationStatus } from './vacation-status.enum';

const actor = { type: 'user', id: 'u-1', role: 'Requester' } as never;
const em = { tx: true } as unknown as EntityManager;

const request = (overrides: Partial<VacationRequest> = {}): VacationRequest =>
  ({
    id: 'r-1',
    userId: 'u-1',
    startDate: '2030-07-01',
    endDate: '2030-07-05',
    reason: 'Private holiday reason',
    status: VacationStatus.Pending,
    comments: null,
    updatedAt: new Date('2030-06-01T10:00:00Z'),
    ...overrides,
  }) as VacationRequest;

function setup() {
  const record = jest.fn().mockResolvedValue(undefined);
  const events = new VacationEventsPublisher({ record } as unknown as OutboxService);
  return { events, record };
}

describe('VacationEventsPublisher (records into the outbox)', () => {
  it('submitted: ids and a snapshot, no free-text reason, in the caller transaction', async () => {
    const { events, record } = setup();
    await events.submitted(request(), actor, em);

    expect(record).toHaveBeenCalledWith(
      VacationEvent.Submitted,
      {
        requestId: 'r-1',
        userId: 'u-1',
        startDate: '2030-07-01',
        endDate: '2030-07-05',
        status: 'Pending',
      },
      actor,
      em,
    );
    expect(JSON.stringify(record.mock.calls[0][1])).not.toContain('Private holiday');
  });

  it('updated: reports exactly which dates changed and whether the reason did', async () => {
    const { events, record } = setup();
    await events.updated(request(), request({ endDate: '2030-07-09', reason: 'new' }), actor, em);

    const [type, data, , manager] = record.mock.calls[0];
    expect(type).toBe(VacationEvent.Updated);
    expect(manager).toBe(em);
    expect(data).toMatchObject({
      endDate: '2030-07-09',
      changes: { endDate: { from: '2030-07-05', to: '2030-07-09' } },
      reasonChanged: true,
    });
    expect(data.changes).not.toHaveProperty('startDate');
  });

  it('updated: an edit that only touches the reason has no date changes', async () => {
    const { events, record } = setup();
    await events.updated(request(), request({ reason: 'other' }), actor, em);
    expect(record.mock.calls[0][1]).toMatchObject({ changes: {}, reasonChanged: true });
  });

  it('updated: reports a changed start date too, and reasonChanged false when untouched', async () => {
    const { events, record } = setup();
    await events.updated(request(), request({ startDate: '2030-06-28' }), actor, em);
    expect(record.mock.calls[0][1]).toMatchObject({
      changes: { startDate: { from: '2030-07-01', to: '2030-06-28' } },
      reasonChanged: false,
    });
  });

  it('cancelled: snapshot of the request that was removed', async () => {
    const { events, record } = setup();
    await events.cancelled(request(), actor, em);
    expect(record).toHaveBeenCalledWith(
      VacationEvent.Cancelled,
      expect.objectContaining({ requestId: 'r-1', status: 'Pending' }),
      actor,
      em,
    );
  });

  it('decided: approved carries decidedAt and the optional comment', async () => {
    const { events, record } = setup();
    await events.decided(
      request({ status: VacationStatus.Approved, comments: 'Enjoy' }),
      actor,
      em,
    );
    expect(record).toHaveBeenCalledWith(
      VacationEvent.Approved,
      expect.objectContaining({
        status: 'Approved',
        decidedAt: '2030-06-01T10:00:00.000Z',
        comment: 'Enjoy',
      }),
      actor,
      em,
    );
  });

  it('decided: rejected carries the rejection comment', async () => {
    const { events, record } = setup();
    await events.decided(
      request({ status: VacationStatus.Rejected, comments: 'Understaffed' }),
      actor,
      em,
    );
    expect(record).toHaveBeenCalledWith(
      VacationEvent.Rejected,
      expect.objectContaining({ status: 'Rejected', comment: 'Understaffed' }),
      actor,
      em,
    );
  });

  it('expired: raised by the system actor with the expiry time', async () => {
    const { events, record } = setup();
    await events.expired(request({ expiredAt: new Date('2030-07-02T00:00:00Z') }) as never, em);
    expect(record).toHaveBeenCalledWith(
      VacationEvent.Expired,
      {
        requestId: 'r-1',
        userId: 'u-1',
        startDate: '2030-07-01',
        endDate: '2030-07-05',
        status: 'Pending',
        expiredAt: '2030-07-02T00:00:00.000Z',
      },
      SYSTEM_ACTOR,
      em,
    );
  });

  it('propagates a failed write, so the surrounding transaction rolls back', async () => {
    const { events, record } = setup();
    record.mockRejectedValue(new Error('insert failed'));
    await expect(events.submitted(request(), actor, em)).rejects.toThrow('insert failed');
  });
});
