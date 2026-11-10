import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { runWithRequestContext } from '../common/request-context/request-context';
import type { LocalstackBootstrapService } from '../localstack/localstack-bootstrap.service';
import { SYSTEM_ACTOR } from './event-envelope';
import { EventPublisherService } from './event-publisher.service';

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
  const sent = () => JSON.parse(send.mock.calls[0][0].input.Entries[0].Detail);
  return { service, send, sent, infraResolved: () => infraResolved };
}

describe('EventPublisherService', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('wraps the data in a versioned envelope with actor and correlation id', async () => {
    const { service, send, sent } = setup();
    const actor = { type: 'user', id: 'u1', role: 'Validator' } as const;

    await runWithRequestContext({ correlationId: 'req-123' }, () =>
      service.publish('travel.x.happened', { a: 1 }, { actor: actor as never }),
    );

    const entry = send.mock.calls[0][0].input.Entries[0];
    expect(entry).toMatchObject({
      EventBusName: 'test-bus',
      Source: 'travel-app.api',
      DetailType: 'travel.x.happened',
    });
    expect(sent()).toEqual({
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

  it('generates a correlation id when there is no request context (e.g. a background job)', async () => {
    const { service, sent } = setup();
    await service.publish('t', {}, { actor: SYSTEM_ACTOR });
    expect(sent().correlationId).toMatch(UUID);
  });

  it('waits for the bus to be provisioned before sending', async () => {
    const { service, send, infraResolved } = setup();
    send.mockImplementation(async () => {
      expect(infraResolved()).toBe(true);
      return { FailedEntryCount: 0 };
    });
    await service.publish('t', {}, { actor: SYSTEM_ACTOR });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('logs one clean line per published event', async () => {
    const { service } = setup();
    const log = jest.spyOn(Logger.prototype, 'log');
    await service.publish('travel.x.happened', { secret: 'x' }, { actor: SYSTEM_ACTOR });
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][0]);
    expect(line).toMatch(/^Published travel\.x\.happened id=\w{8} correlation=\w{8} actor=system$/);
  });

  it('throws when the bus rejects the entry', async () => {
    const { service } = setup({
      FailedEntryCount: 1,
      Entries: [{ ErrorCode: 'Boom', ErrorMessage: 'nope' }],
    });
    await expect(service.publish('t', {}, { actor: SYSTEM_ACTOR })).rejects.toThrow(
      'PutEvents failed: Boom nope',
    );
  });

  it('publishBestEffort logs and swallows failures', async () => {
    const { service, send } = setup();
    send.mockRejectedValue(new Error('bus down'));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    await expect(
      service.publishBestEffort('t', {}, { actor: SYSTEM_ACTOR }),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith('Could not publish t: bus down');
  });
});
