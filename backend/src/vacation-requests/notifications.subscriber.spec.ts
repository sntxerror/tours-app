import { Logger } from '@nestjs/common';
import type { EventEnvelope } from '../events/event-envelope';
import type { EventRouter, Subscription } from '../events/event-router.service';
import { VacationEvent } from '../events/event-types';
import { NotificationsSubscriber } from './notifications.subscriber';

const envelope = (type: string): EventEnvelope => ({
  eventId: 'e-1',
  schemaVersion: 1,
  occurredAt: '2030-01-01T00:00:00.000Z',
  source: 'travel-app.api',
  type,
  correlationId: 'c-1',
  actor: { type: 'system' },
  data: { requestId: 'r-1', userId: 'u-1', startDate: '2030-01-01', endDate: '2030-01-03' },
});

function setup() {
  const subscribe = jest.fn<void, [Subscription]>();
  new NotificationsSubscriber({ subscribe } as unknown as EventRouter).onModuleInit();
  return subscribe.mock.calls[0][0];
}

describe('NotificationsSubscriber', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('subscribes to the outcomes a requester cares about', () => {
    expect(setup().types).toEqual([
      VacationEvent.Approved,
      VacationEvent.Rejected,
      VacationEvent.Expired,
    ]);
  });

  it.each([
    [VacationEvent.Approved, 'was approved'],
    [VacationEvent.Rejected, 'was rejected'],
    [VacationEvent.Expired, 'started before anyone decided on it'],
  ])('logs the message it would send for %s', async (type, outcome) => {
    const { handle } = setup();

    await handle(envelope(type), { body: {}, commonEventVersion: 'sqsEvent' });

    expect(log).toHaveBeenCalledWith(`Would notify user u-1: your request r-1 ${outcome}`);
  });
});
