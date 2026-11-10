import { Logger } from '@nestjs/common';
import type { Message } from '@aws-sdk/client-sqs';
import type { EventEnvelope } from './event-envelope';
import { describeEvent } from './event-log';
import type { CommonEvent } from 'commoneventframework/dist/types/commonEvent';
import {
  type Delivery,
  type EventHandler,
  EventRouter,
  MalformedMessageError,
  parseEnvelope,
} from './event-router.service';
import { AuthEvent, DevEvent, type EventType, VacationEvent } from './event-types';

const QUEUE_ARN = 'arn:aws:sqs:eu-central-1:000000000000:travel-events';

const envelope = (type: EventType, over: Partial<EventEnvelope> = {}): EventEnvelope => ({
  eventId: '3f2a9c1e-aaaa-bbbb-cccc-000000000000',
  schemaVersion: 1,
  occurredAt: '2030-01-01T00:00:00.000Z',
  source: 'travel-app.api',
  type,
  correlationId: '7b1d0e44-aaaa-bbbb-cccc-000000000000',
  actor: { type: 'system' },
  data: { requestId: 'r-1' },
  ...over,
});

const wrapper = (detailType: string, detail: unknown) => ({
  version: '0',
  id: 'eb-0001',
  'detail-type': detailType,
  source: 'travel-app.api',
  account: '000000000000',
  time: '2030-01-01T00:00:00Z',
  region: 'eu-central-1',
  resources: [],
  detail,
});

const message = (body: string | undefined, id = 'msg-1'): Message => ({
  MessageId: id,
  ReceiptHandle: `rh-${id}`,
  Body: body,
  MD5OfBody: 'md5',
});

const eventMessage = (env: EventEnvelope, detailType: string = env.type) =>
  message(JSON.stringify(wrapper(detailType, env)));

let seq = 0;
function subscriber(router: EventRouter, types: readonly EventType[], handle?: EventHandler) {
  const name = `test-subscriber-${++seq}`;
  const fn = jest.fn<Promise<void>, [EventEnvelope, Delivery]>(handle ?? (async () => undefined));
  router.subscribe({ name, types, handle: fn });
  return { name, fn };
}

describe('EventRouter', () => {
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('delivers the envelope and the raw delivery to every subscriber of the type', async () => {
    const router = new EventRouter();
    const a = subscriber(router, [VacationEvent.Submitted]);
    const b = subscriber(router, [VacationEvent.Submitted, VacationEvent.Approved]);
    const env = envelope(VacationEvent.Submitted);

    await router.dispatch(eventMessage(env), QUEUE_ARN);

    for (const { fn } of [a, b]) {
      expect(fn).toHaveBeenCalledTimes(1);
      const [received, delivery] = fn.mock.calls[0];
      expect(received).toEqual(env);
      expect(delivery.commonEventVersion).toBe('sqsEvent');
      expect(delivery.body).toMatchObject(wrapper(env.type, env));
    }
  });

  it('calls only the subscribers of the dispatched type', async () => {
    const router = new EventRouter();
    const vacation = subscriber(router, [VacationEvent.Approved]);
    const auth = subscriber(router, [AuthEvent.LoginFailed]);

    await router.dispatch(eventMessage(envelope(AuthEvent.LoginFailed)), QUEUE_ARN);

    expect(auth.fn).toHaveBeenCalledTimes(1);
    expect(vacation.fn).not.toHaveBeenCalled();
  });

  it('picks up subscribers added after the first dispatch', async () => {
    const router = new EventRouter();
    const first = subscriber(router, [VacationEvent.Updated]);
    await router.dispatch(eventMessage(envelope(VacationEvent.Updated)), QUEUE_ARN);

    const late = subscriber(router, [VacationEvent.Updated, VacationEvent.Expired]);
    await router.dispatch(eventMessage(envelope(VacationEvent.Updated)), QUEUE_ARN);
    await router.dispatch(eventMessage(envelope(VacationEvent.Expired)), QUEUE_ARN);

    expect(first.fn).toHaveBeenCalledTimes(2);
    expect(late.fn).toHaveBeenCalledTimes(2);
    expect(late.fn.mock.calls.map(([e]) => e.type)).toEqual([
      VacationEvent.Updated,
      VacationEvent.Expired,
    ]);
  });

  it('rejects naming the failing subscriber, after letting its siblings run', async () => {
    const router = new EventRouter();
    const failing = subscriber(router, [VacationEvent.Rejected], async () => {
      throw new Error('db down');
    });
    const sibling = subscriber(router, [VacationEvent.Rejected]);
    const env = envelope(VacationEvent.Rejected);

    const result = router.dispatch(eventMessage(env), QUEUE_ARN);

    await expect(result).rejects.toThrow(`${failing.name}: db down`);
    await expect(result).rejects.toThrow(`${VacationEvent.Rejected} ${env.eventId}`);
    await expect(result).rejects.not.toThrow(sibling.name);
    expect(sibling.fn).toHaveBeenCalledTimes(1);
  });

  it('lists every failing subscriber', async () => {
    const router = new EventRouter();
    const one = subscriber(router, [VacationEvent.Cancelled], async () => {
      throw new Error('first');
    });
    const two = subscriber(router, [VacationEvent.Cancelled], () => Promise.reject('second'));

    await expect(
      router.dispatch(eventMessage(envelope(VacationEvent.Cancelled)), QUEUE_ARN),
    ).rejects.toThrow(`${one.name}: first; ${two.name}: second`);
  });

  it.each([
    ['a body that is not JSON', 'not json at all'],
    ['an empty body', undefined],
    ['a JSON body that is not an EventBridge event', JSON.stringify({ hello: 'world' })],
    ['a JSON scalar', JSON.stringify('travel.vacation-request.submitted')],
    ['JSON null', 'null'],
    [
      'an event without detail-type',
      JSON.stringify({ version: '0', detail: envelope(VacationEvent.Submitted) }),
    ],
  ])('drops %s as malformed, logging an error', async (_label, body) => {
    const router = new EventRouter();
    const sub = subscriber(router, [VacationEvent.Submitted]);

    await expect(router.dispatch(message(body, 'bad-1'), QUEUE_ARN)).resolves.toBeUndefined();

    expect(sub.fn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      'Dropping malformed message bad-1: not an EventBridge event',
    );
  });

  it.each([
    ['no envelope at all', undefined],
    ['null', null],
    ['an envelope without an event id', { ...envelope(VacationEvent.Approved), eventId: 1 }],
    ['an envelope without data', { ...envelope(VacationEvent.Approved), data: null }],
    ['an envelope without an actor', { ...envelope(VacationEvent.Approved), actor: undefined }],
    ['an envelope of another type', envelope(VacationEvent.Rejected)],
  ])('drops an event whose detail holds %s', async (_label, detail) => {
    const router = new EventRouter();
    const sub = subscriber(router, [VacationEvent.Approved, VacationEvent.Rejected]);

    await expect(
      router.dispatch(message(JSON.stringify(wrapper(VacationEvent.Approved, detail))), QUEUE_ARN),
    ).resolves.toBeUndefined();

    expect(sub.fn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(
      `Dropping malformed message msg-1: the ${VacationEvent.Approved} event does not hold a valid envelope`,
    );
  });

  it('skips a valid event nobody subscribed to, with a warning', async () => {
    const router = new EventRouter();
    const sub = subscriber(router, [VacationEvent.Submitted]);

    await expect(
      router.dispatch(eventMessage(envelope(AuthEvent.LoginSucceeded)), QUEUE_ARN),
    ).resolves.toBeUndefined();

    expect(sub.fn).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(`No subscriber for ${AuthEvent.LoginSucceeded}, skipping`);
  });

  it('skips events when nothing subscribed at all', async () => {
    const router = new EventRouter();

    await expect(
      router.dispatch(eventMessage(envelope(VacationEvent.Submitted)), QUEUE_ARN),
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(`No subscriber for ${VacationEvent.Submitted}, skipping`);
  });

  it('logs one clean line per event, not one per subscriber', async () => {
    const router = new EventRouter();
    subscriber(router, [VacationEvent.Approved]);
    subscriber(router, [VacationEvent.Approved]);
    subscriber(router, [VacationEvent.Approved]);
    const env = envelope(VacationEvent.Approved, { data: { comment: 'secret reason' } });

    await router.dispatch(eventMessage(env), QUEUE_ARN);

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(`Received ${describeEvent(env)}`);
    expect(log.mock.calls[0][0]).not.toContain('secret');
  });

  it("keeps the framework's debug output off the console", async () => {
    const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const router = new EventRouter();
    subscriber(router, [VacationEvent.Submitted]);

    await router.dispatch(eventMessage(envelope(VacationEvent.Submitted)), QUEUE_ARN);
    await router.dispatch(message('garbage'), QUEUE_ARN);

    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('routes on detail-type only: a path inside the message cannot redirect it', async () => {
    const router = new EventRouter();
    const submitted = subscriber(router, [VacationEvent.Submitted]);
    const approved = subscriber(router, [VacationEvent.Approved]);
    const env = envelope(VacationEvent.Submitted);
    const body = { ...wrapper(env.type, env), path: `/events/${VacationEvent.Approved}` };

    await router.dispatch(message(JSON.stringify(body)), QUEUE_ARN);

    expect(submitted.fn).toHaveBeenCalledTimes(1);
    expect(approved.fn).not.toHaveBeenCalled();
  });

  it('drops a bare body carrying its own path (not an EventBridge event)', async () => {
    const router = new EventRouter();
    const sub = subscriber(router, [VacationEvent.Submitted]);
    const env = envelope(VacationEvent.Submitted);
    const body = { path: `/events/${VacationEvent.Submitted}`, detail: env };

    await router.dispatch(message(JSON.stringify(body)), QUEUE_ARN);

    expect(sub.fn).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('not an EventBridge event'));
  });

  it('routes any subscribed type, including the dev ping outside the business list', async () => {
    const router = new EventRouter();
    const ping = subscriber(router, [DevEvent.Ping]);
    const env = envelope(DevEvent.Ping, { data: { message: 'hello' } });

    await router.dispatch(eventMessage(env), QUEUE_ARN);

    expect(ping.fn).toHaveBeenCalledWith(env, expect.anything());
  });

  it('does not log an error when a subscriber fails (that is retried, not dropped)', async () => {
    const router = new EventRouter();
    subscriber(router, [VacationEvent.Approved], async () => {
      throw new Error('db down');
    });

    await expect(
      router.dispatch(eventMessage(envelope(VacationEvent.Approved)), QUEUE_ARN),
    ).rejects.toThrow('db down');
    expect(error).not.toHaveBeenCalled();
  });
});

describe("parseEnvelope (the routes' input parser)", () => {
  const common = (type: string, body: unknown) =>
    ({ path: `/events/${type}`, method: 'PUT', body: JSON.stringify(body) }) as CommonEvent;

  it('returns the envelope from detail and the whole body', () => {
    const env = envelope(VacationEvent.Expired);
    const body = wrapper(env.type, env);

    expect(parseEnvelope(common(env.type, body))).toEqual({ envelope: env, body });
  });

  it('throws MalformedMessageError when the envelope does not match the route', () => {
    const env = envelope(VacationEvent.Expired);

    expect(() => parseEnvelope(common(VacationEvent.Approved, wrapper(env.type, env)))).toThrow(
      MalformedMessageError,
    );
  });
});
