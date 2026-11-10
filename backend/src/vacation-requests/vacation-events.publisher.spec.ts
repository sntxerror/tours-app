import type { EventPublisherService } from '../events/event-publisher.service';
import { SYSTEM_ACTOR } from '../events/event-envelope';
import { VacationEvent, VacationEventsPublisher } from './vacation-events.publisher';
import type { VacationRequest } from './vacation-request.entity';
import { VacationStatus } from './vacation-status.enum';

const actor = { type: 'user', id: 'u-1', role: 'Requester' } as never;

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
  const publish = jest.fn().mockResolvedValue(undefined);
  const publishBestEffort = jest.fn().mockResolvedValue(undefined);
  const events = new VacationEventsPublisher({
    publish,
    publishBestEffort,
  } as unknown as EventPublisherService);
  return { events, publish, publishBestEffort };
}

describe('VacationEventsPublisher', () => {
  it('submitted: ids and a snapshot, no free-text reason', async () => {
    const { events, publishBestEffort } = setup();
    await events.submitted(request(), actor);

    expect(publishBestEffort).toHaveBeenCalledWith(
      VacationEvent.Submitted,
      {
        requestId: 'r-1',
        userId: 'u-1',
        startDate: '2030-07-01',
        endDate: '2030-07-05',
        status: 'Pending',
      },
      { actor },
    );
    expect(JSON.stringify(publishBestEffort.mock.calls[0][1])).not.toContain('Private holiday');
  });

  it('updated: reports exactly which dates changed and whether the reason did', async () => {
    const { events, publishBestEffort } = setup();
    await events.updated(
      request(),
      request({ endDate: '2030-07-09', reason: 'new reason' }),
      actor,
    );

    const [type, data] = publishBestEffort.mock.calls[0];
    expect(type).toBe(VacationEvent.Updated);
    expect(data).toMatchObject({
      endDate: '2030-07-09',
      changes: { endDate: { from: '2030-07-05', to: '2030-07-09' } },
      reasonChanged: true,
    });
    expect(data.changes).not.toHaveProperty('startDate');
  });

  it('updated: an edit that only touches the reason has no date changes', async () => {
    const { events, publishBestEffort } = setup();
    await events.updated(request(), request({ reason: 'other' }), actor);
    expect(publishBestEffort.mock.calls[0][1]).toMatchObject({ changes: {}, reasonChanged: true });
  });

  it('cancelled: snapshot of the request that was removed', async () => {
    const { events, publishBestEffort } = setup();
    await events.cancelled(request(), actor);
    expect(publishBestEffort).toHaveBeenCalledWith(
      VacationEvent.Cancelled,
      expect.objectContaining({ requestId: 'r-1', status: 'Pending' }),
      { actor },
    );
  });

  it('decided: approved carries decidedAt and the optional comment', async () => {
    const { events, publishBestEffort } = setup();
    await events.decided(request({ status: VacationStatus.Approved, comments: 'Enjoy' }), actor);
    expect(publishBestEffort).toHaveBeenCalledWith(
      VacationEvent.Approved,
      expect.objectContaining({
        status: 'Approved',
        decidedAt: '2030-06-01T10:00:00.000Z',
        comment: 'Enjoy',
      }),
      { actor },
    );
  });

  it('decided: rejected carries the rejection comment', async () => {
    const { events, publishBestEffort } = setup();
    await events.decided(
      request({ status: VacationStatus.Rejected, comments: 'Understaffed' }),
      actor,
    );
    expect(publishBestEffort).toHaveBeenCalledWith(
      VacationEvent.Rejected,
      expect.objectContaining({ status: 'Rejected', comment: 'Understaffed' }),
      { actor },
    );
  });

  it('expired: published strictly (not best-effort) by the system actor', async () => {
    const { events, publish, publishBestEffort } = setup();
    await events.expired({
      id: 'r-1',
      userId: 'u-1',
      startDate: '2030-07-01',
      endDate: '2030-07-05',
      expiredAt: new Date('2030-07-02T00:00:00Z'),
    });
    expect(publishBestEffort).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledWith(
      VacationEvent.Expired,
      {
        requestId: 'r-1',
        userId: 'u-1',
        startDate: '2030-07-01',
        endDate: '2030-07-05',
        status: 'Pending',
        expiredAt: '2030-07-02T00:00:00.000Z',
      },
      { actor: SYSTEM_ACTOR },
    );
  });

  it('expired: lets a publish failure propagate so the job can retry', async () => {
    const { events, publish } = setup();
    publish.mockRejectedValue(new Error('bus down'));
    await expect(
      events.expired({ id: 'r', userId: 'u', startDate: 'a', endDate: 'b', expiredAt: new Date() }),
    ).rejects.toThrow('bus down');
  });
});
