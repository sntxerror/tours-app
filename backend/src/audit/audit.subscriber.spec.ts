import { Logger } from '@nestjs/common';
import type { EventEnvelope } from '../events/event-envelope';
import type { EventRouter, Subscription } from '../events/event-router.service';
import { ALL_EVENT_TYPES, VacationEvent } from '../events/event-types';
import type { AuditService } from './audit.service';
import { AuditSubscriber } from './audit.subscriber';

const envelope: EventEnvelope = {
  eventId: 'e-1',
  schemaVersion: 1,
  occurredAt: '2030-01-01T00:00:00.000Z',
  source: 'travel-app.api',
  type: VacationEvent.Submitted,
  correlationId: 'req-1',
  actor: { type: 'system' },
  data: { requestId: 'r-1' },
};
const delivery = { body: { detail: envelope }, commonEventVersion: 'sqsEvent' };

function setup() {
  const subscribe = jest.fn();
  const record = jest.fn().mockResolvedValue(true);
  const subscriber = new AuditSubscriber(
    { subscribe } as unknown as EventRouter,
    { record } as unknown as AuditService,
  );
  subscriber.onModuleInit();
  const subscription = subscribe.mock.calls[0][0] as Subscription;
  return { subscribe, record, subscription };
}

describe('AuditSubscriber', () => {
  let debug: jest.SpyInstance;

  beforeEach(() => {
    debug = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("subscribes as 'audit-log' to every event type", () => {
    const { subscribe, subscription } = setup();
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscription.name).toBe('audit-log');
    expect(subscription.types).toEqual(ALL_EVENT_TYPES);
  });

  it('records each delivered envelope', async () => {
    const { record, subscription } = setup();
    await expect(subscription.handle(envelope, delivery)).resolves.toBeUndefined();
    expect(record).toHaveBeenCalledWith(envelope);
    expect(debug).not.toHaveBeenCalled();
  });

  it('treats a duplicate delivery as success', async () => {
    const { record, subscription } = setup();
    record.mockResolvedValueOnce(false);

    await expect(subscription.handle(envelope, delivery)).resolves.toBeUndefined();
    expect(debug).toHaveBeenCalledWith('Duplicate delivery of e-1, already recorded');
  });

  it('fails the delivery when the audit row cannot be written, so it is retried', async () => {
    const { record, subscription } = setup();
    record.mockRejectedValueOnce(new Error('db down'));
    await expect(subscription.handle(envelope, delivery)).rejects.toThrow('db down');
  });
});
