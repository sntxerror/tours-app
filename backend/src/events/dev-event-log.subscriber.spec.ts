import { Logger } from '@nestjs/common';
import { DevEventLogSubscriber } from './dev-event-log.subscriber';
import type { EventEnvelope } from './event-envelope';
import { EventRouter, type Subscription } from './event-router.service';
import { ALL_EVENT_TYPES, DevEvent, VacationEvent } from './event-types';
import { ReceivedEventsStore } from './received-events.store';

const envelope: EventEnvelope = {
  eventId: '3f2a9c1e-aaaa-bbbb-cccc-000000000000',
  schemaVersion: 1,
  occurredAt: '2030-01-01T00:00:00.000Z',
  source: 'travel-app.api',
  type: VacationEvent.Expired,
  correlationId: 'job-1',
  actor: { type: 'system' },
  data: { requestId: 'r-1' },
};

describe('DevEventLogSubscriber', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function setup() {
    const subscribe = jest.fn();
    const store = new ReceivedEventsStore();
    new DevEventLogSubscriber({ subscribe } as unknown as EventRouter, store).onModuleInit();
    return { subscribe, store, subscription: subscribe.mock.calls[0][0] as Subscription };
  }

  it("subscribes as 'dev-log' to every business event plus the dev ping", () => {
    const { subscribe, subscription } = setup();
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscription.name).toBe('dev-log');
    expect(subscription.types).toEqual([...ALL_EVENT_TYPES, DevEvent.Ping]);
  });

  it('keeps the raw delivery in the store, keyed by event id', async () => {
    jest.useFakeTimers({ now: new Date('2030-01-02T03:04:05.000Z') });
    const { store, subscription } = setup();
    const body = { 'detail-type': envelope.type, detail: envelope };

    await subscription.handle(envelope, { body, commonEventVersion: 'sqsEvent' });

    expect(store.list()).toEqual([
      {
        eventId: envelope.eventId,
        receivedAt: '2030-01-02T03:04:05.000Z',
        commonEventVersion: 'sqsEvent',
        envelope: body,
      },
    ]);
  });

  it('lists an event redelivered through the router only once', async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const router = new EventRouter();
    const store = new ReceivedEventsStore();
    new DevEventLogSubscriber(router, store).onModuleInit();
    const message = {
      MessageId: 'm-1',
      Body: JSON.stringify({ version: '0', 'detail-type': envelope.type, detail: envelope }),
    };

    await router.dispatch(message, 'arn:aws:sqs:eu-central-1:000000000000:q');
    await router.dispatch(
      { ...message, MessageId: 'm-2' },
      'arn:aws:sqs:eu-central-1:000000000000:q',
    );

    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]).toMatchObject({
      eventId: envelope.eventId,
      commonEventVersion: 'sqsEvent',
      envelope: { detail: envelope },
    });
  });
});
