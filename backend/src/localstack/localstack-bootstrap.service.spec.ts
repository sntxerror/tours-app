import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  CreateEventBusCommand,
  type EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  ResourceAlreadyExistsException,
} from '@aws-sdk/client-eventbridge';
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  type SQSClient,
  SetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';
import { LocalstackBootstrapService } from './localstack-bootstrap.service';

const BASE_CONFIG = {
  EVENT_BUS_NAME: 'travel-bus',
  EVENT_QUEUE_NAME: 'travel-events',
  EVENT_RULE_NAME: 'travel-all',
};

const urlOf = (name: string) => `http://localhost:4566/000000000000/${name}`;
const arnOf = (name: string) => `arn:aws:sqs:eu-central-1:000000000000:${name}`;

interface Command {
  input: Record<string, unknown>;
}

function setup(config: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { ...BASE_CONFIG, ...config };
  const calls: string[] = [];
  const queueOf = (url: unknown) => String(url).split('/').pop();

  const sqsSend = jest.fn(async (command: Command): Promise<object> => {
    if (command instanceof CreateQueueCommand) {
      const name = command.input.QueueName as string;
      calls.push(`CreateQueue ${name}`);
      return { QueueUrl: urlOf(name) };
    }
    if (command instanceof GetQueueAttributesCommand) {
      const name = queueOf(command.input.QueueUrl);
      calls.push(`GetQueueAttributes ${name}`);
      return { Attributes: { QueueArn: arnOf(name!) } };
    }
    if (command instanceof SetQueueAttributesCommand) {
      calls.push(`SetQueueAttributes ${queueOf(command.input.QueueUrl)}`);
      return {};
    }
    throw new Error(`unexpected SQS command ${command.constructor.name}`);
  });
  const ebSend = jest.fn(async (command: Command): Promise<object> => {
    if (command instanceof CreateEventBusCommand) calls.push('CreateEventBus');
    else if (command instanceof PutRuleCommand) calls.push('PutRule');
    else if (command instanceof PutTargetsCommand) calls.push('PutTargets');
    else throw new Error(`unexpected EventBridge command ${command.constructor.name}`);
    return {};
  });

  const service = new LocalstackBootstrapService(
    {
      get: (key: string) => values[key],
      getOrThrow: (key: string) => {
        if (values[key] === undefined) throw new Error(`missing ${key}`);
        return values[key];
      },
    } as unknown as ConfigService,
    { send: ebSend } as unknown as EventBridgeClient,
    { send: sqsSend } as unknown as SQSClient,
  );

  const inputOf = <T>(send: jest.Mock, type: abstract new (...args: never[]) => T) =>
    send.mock.calls.map(([c]) => c as Command).filter((c) => c instanceof type)[0]?.input;
  const attributes = () =>
    inputOf(sqsSend, SetQueueAttributesCommand)?.Attributes as Record<string, string>;

  return { service, sqsSend, ebSend, calls, inputOf, attributes };
}

describe('LocalstackBootstrapService', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('provisions bus, queue, rule and target in order', async () => {
    const { service, calls } = setup();

    service.onModuleInit();
    await service.infra;

    expect(calls).toEqual([
      'CreateEventBus',
      'CreateQueue travel-events',
      'GetQueueAttributes travel-events',
      'SetQueueAttributes travel-events',
      'PutRule',
      'PutTargets',
    ]);
  });

  it('resolves infra with the bus and queue', async () => {
    const { service } = setup();

    service.onModuleInit();

    await expect(service.infra).resolves.toEqual({
      busName: 'travel-bus',
      queueUrl: urlOf('travel-events'),
      queueArn: arnOf('travel-events'),
    });
  });

  it('creates the queue without attributes so re-creating it is idempotent', async () => {
    const { service, sqsSend } = setup();

    service.onModuleInit();
    await service.infra;

    const creates = sqsSend.mock.calls
      .map(([c]) => c as Command)
      .filter((c) => c instanceof CreateQueueCommand);
    expect(creates.map((c) => c.input)).toEqual([{ QueueName: 'travel-events' }]);
    const getAttributes = sqsSend.mock.calls
      .map(([c]) => c as Command)
      .filter((c) => c instanceof GetQueueAttributesCommand);
    for (const c of getAttributes) expect(c.input.AttributeNames).toEqual(['QueueArn']);
  });

  it('lets EventBridge deliver to the queue and sets nothing else', async () => {
    const { service, sqsSend, inputOf, attributes } = setup();

    service.onModuleInit();
    await service.infra;

    expect(inputOf(sqsSend, SetQueueAttributesCommand)?.QueueUrl).toBe(urlOf('travel-events'));
    const attrs = attributes();
    expect(Object.keys(attrs)).toEqual(['Policy']);
    expect(JSON.parse(attrs.Policy)).toEqual({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: 'events.amazonaws.com' },
          Action: 'sqs:SendMessage',
          Resource: arnOf('travel-events'),
        },
      ],
    });
  });

  it('routes every event on the bus to the queue', async () => {
    const { service, ebSend, inputOf } = setup();

    service.onModuleInit();
    await service.infra;

    expect(inputOf(ebSend, CreateEventBusCommand)).toEqual({ Name: 'travel-bus' });
    const rule = inputOf(ebSend, PutRuleCommand)!;
    expect(rule).toMatchObject({
      Name: 'travel-all',
      EventBusName: 'travel-bus',
      State: 'ENABLED',
    });
    expect(JSON.parse(rule.EventPattern as string)).toEqual({ source: [{ prefix: '' }] });
    expect(inputOf(ebSend, PutTargetsCommand)).toEqual({
      Rule: 'travel-all',
      EventBusName: 'travel-bus',
      Targets: [{ Id: 'sqs-target', Arn: arnOf('travel-events') }],
    });
  });

  it('tolerates a bus that already exists', async () => {
    const { service, ebSend, calls } = setup();
    ebSend.mockImplementationOnce(async () => {
      throw new ResourceAlreadyExistsException({
        $metadata: {},
        message: 'Event bus travel-bus already exists',
      });
    });

    service.onModuleInit();

    await expect(service.infra).resolves.toMatchObject({ busName: 'travel-bus' });
    expect(calls).toContain('PutTargets');
    expect(warn).not.toHaveBeenCalled();
  });

  describe('retries', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('retries with exponential backoff while LocalStack is not ready', async () => {
      const { service, ebSend } = setup();
      const notReady = async () => {
        throw new Error('connect ECONNREFUSED');
      };
      ebSend.mockImplementationOnce(notReady).mockImplementationOnce(notReady);
      let resolved = false;
      void service.infra.then(() => (resolved = true));

      service.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      expect(warn).toHaveBeenCalledWith(
        'LocalStack not ready (attempt 1/30): connect ECONNREFUSED. Retrying in 500ms',
      );

      await jest.advanceTimersByTimeAsync(500);
      expect(warn).toHaveBeenLastCalledWith(
        'LocalStack not ready (attempt 2/30): connect ECONNREFUSED. Retrying in 1000ms',
      );
      expect(resolved).toBe(false);

      await jest.advanceTimersByTimeAsync(1_000);
      await expect(service.infra).resolves.toMatchObject({ queueArn: arnOf('travel-events') });
      expect(warn).toHaveBeenCalledTimes(2);
      expect(error).not.toHaveBeenCalled();
    });

    it('also retries when the queue comes back without an ARN', async () => {
      const { service, sqsSend } = setup();
      sqsSend
        .mockImplementationOnce(async () => ({ QueueUrl: urlOf('travel-events') }))
        .mockImplementationOnce(async () => ({ Attributes: {} }));

      service.onModuleInit();
      await jest.advanceTimersByTimeAsync(0);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Queue travel-events has no ARN'));

      await jest.advanceTimersByTimeAsync(500);
      await expect(service.infra).resolves.toMatchObject({ queueUrl: urlOf('travel-events') });
    });

    it('caps the backoff at 5 seconds and gives up after 30 attempts', async () => {
      const { service, ebSend } = setup();
      ebSend.mockRejectedValue(new Error('connect ECONNREFUSED'));
      let settled = false;
      service.infra.catch(() => undefined).finally(() => (settled = true));

      service.onModuleInit();
      // 500 + 1000 + 2000 + 4000, then 26 x 5000 (the wait after the last attempt included).
      await jest.advanceTimersByTimeAsync(137_499);
      expect(settled).toBe(false);
      expect(ebSend).toHaveBeenCalledTimes(30);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('(attempt 5/30)'));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Retrying in 5000ms'));
      expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Retrying in 8000ms'));

      await jest.advanceTimersByTimeAsync(1);
      await expect(service.infra).rejects.toThrow('LocalStack unreachable after 30 attempts');
      expect(ebSend).toHaveBeenCalledTimes(30);
      expect(error).toHaveBeenCalledWith('LocalStack unreachable after 30 attempts');
    });
  });
});
