import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { runWithRequestContext } from '../common/request-context/request-context';
import type { LocalstackBootstrapService } from '../localstack/localstack-bootstrap.service';
import { type EventEnvelope, SYSTEM_ACTOR } from './event-envelope';
import { EventPublisherService, EventRejectedError } from './event-publisher.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function setup(sendResult: object = { FailedEntryCount: 0 }) {
  const send = jest.fn().mockResolvedValue(sendResult);
  let infraResolved = false;
  const infra = new Promise((resolve) =>
    setImmediate(() => {
      infraResolved = true;
      resolve({});
    }),
  );
  const service = new EventPublisherService(
    { getOrThrow: () => 'test-bus' } as unknown as ConfigService,
    { infra } as unknown as LocalstackBootstrapService,
    { send } as unknown as EventBridgeClient,
  );
  const entry = () => send.mock.calls[0][0].input.Entries[0];
  return { service, send, entry, infraResolved: () => infraResolved };
}

const envelope = (over: Partial<EventEnvelope> = {}): EventEnvelope => ({
  eventId: 'fixed-event-id',
  schemaVersion: 1,
  occurredAt: '2030-01-01T00:00:00.000Z',
  source: 'travel-app.api',
  type: 'travel.x.happened',
  correlationId: 'req-1',
  actor: SYSTEM_ACTOR,
  data: { a: 1 },
  ...over,
});

describe('EventPublisherService', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  describe('buildEnvelope', () => {
    it('wraps the data in a versioned envelope with actor and correlation id', () => {
      const { service } = setup();
      const actor = { type: 'user', id: 'u1', role: 'Validator' } as never;

      const built = runWithRequestContext({ correlationId: 'req-123' }, () =>
        service.buildEnvelope('travel.x.happened', { a: 1 }, { actor }),
      );

      expect(built).toEqual({
        eventId: expect.stringMatching(UUID),
        schemaVersion: 1,
        occurredAt: expect.any(String),
        source: 'travel-app.api',
        type: 'travel.x.happened',
        correlationId: 'req-123',
        actor,
        data: { a: 1 },
      });
    });

    it('generates a correlation id when there is no request context', () => {
      const { service } = setup();
      const built = service.buildEnvelope('t', {}, { actor: SYSTEM_ACTOR });
      expect(built.correlationId).toMatch(UUID);
    });

    it('gives every envelope its own event id and honours a custom source', () => {
      const { service } = setup();
      const a = service.buildEnvelope('t', {}, { actor: SYSTEM_ACTOR, source: 'other.source' });
      const b = service.buildEnvelope('t', {}, { actor: SYSTEM_ACTOR });
      expect(a.source).toBe('other.source');
      expect(a.eventId).not.toBe(b.eventId);
    });
  });

  describe('send', () => {
    it('puts the envelope on the bus unchanged, keeping its event id', async () => {
      const { service, entry } = setup();
      const e = envelope();

      await service.send(e);

      expect(entry()).toMatchObject({
        EventBusName: 'test-bus',
        Source: 'travel-app.api',
        DetailType: 'travel.x.happened',
      });
      expect(JSON.parse(entry().Detail)).toEqual(e);
    });

    it('waits for the bus to be provisioned before sending', async () => {
      const { service, send, infraResolved } = setup();
      send.mockImplementation(async () => {
        expect(infraResolved()).toBe(true);
        return { FailedEntryCount: 0 };
      });
      await service.send(envelope());
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('logs one clean line per published event, without the payload', async () => {
      const { service } = setup();
      const log = jest.spyOn(Logger.prototype, 'log');

      await service.send(envelope({ data: { secret: 'x' } }));

      expect(log).toHaveBeenCalledTimes(1);
      const line = String(log.mock.calls[0][0]);
      expect(line).toMatch(/^Published travel\.x\.happened id=\S{8} correlation=\S+ actor=system$/);
      expect(line).not.toContain('secret');
    });

    it('throws EventRejectedError when the bus rejects the entry', async () => {
      const { service } = setup({
        FailedEntryCount: 1,
        Entries: [{ ErrorCode: 'Boom', ErrorMessage: 'nope' }],
      });
      const result = service.send(envelope());
      await expect(result).rejects.toBeInstanceOf(EventRejectedError);
      await expect(result).rejects.toThrow('PutEvents failed: Boom nope');
    });

    it('lets transport failures through as plain errors (the bus is unreachable, not unhappy)', async () => {
      const { service, send } = setup();
      send.mockRejectedValue(new Error('connect ECONNREFUSED'));
      const result = service.send(envelope());
      await expect(result).rejects.toThrow('connect ECONNREFUSED');
      await expect(result).rejects.not.toBeInstanceOf(EventRejectedError);
    });
  });

  describe('publish', () => {
    it('builds and sends in one go and returns the envelope', async () => {
      const { service, entry } = setup();
      const published = await service.publish(
        'travel.x.happened',
        { a: 1 },
        { actor: SYSTEM_ACTOR },
      );
      expect(JSON.parse(entry().Detail)).toEqual(published);
      expect(published.type).toBe('travel.x.happened');
    });
  });
});
