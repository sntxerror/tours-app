import { Logger } from '@nestjs/common';
import type { Message, SQSClient } from '@aws-sdk/client-sqs';
import type { LocalstackBootstrapService } from '../localstack/localstack-bootstrap.service';
import { EventConsumerService } from './event-consumer.service';
import type { EventRouter } from './event-router.service';

const QUEUE_ARN = 'arn:aws:sqs:eu-central-1:000000000000:travel-events';

const message = (id: string): Message => ({ MessageId: id, ReceiptHandle: `rh-${id}`, Body: '{}' });

function setup(infra: Promise<unknown> = new Promise(() => undefined)) {
  const dispatch = jest.fn().mockResolvedValue(undefined);
  const sqsSend = jest.fn();
  const service = new EventConsumerService(
    { send: sqsSend } as unknown as SQSClient,
    { infra } as unknown as LocalstackBootstrapService,
    { dispatch } as unknown as EventRouter,
  );
  return { service, dispatch, sqsSend };
}

describe('EventConsumerService', () => {
  let error: jest.SpyInstance;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  describe('processBatch', () => {
    it('dispatches every message with the queue ARN and returns them all when handled', async () => {
      const { service, dispatch } = setup();
      const batch = [message('a'), message('b')];

      await expect(service.processBatch(batch, QUEUE_ARN)).resolves.toEqual(batch);

      expect(dispatch.mock.calls).toEqual([
        [batch[0], QUEUE_ARN],
        [batch[1], QUEUE_ARN],
      ]);
      expect(error).not.toHaveBeenCalled();
    });

    it('leaves a message whose subscribers failed for redelivery and carries on', async () => {
      const { service, dispatch } = setup();
      const batch = [message('a'), message('b'), message('c')];
      dispatch.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('db down'));

      const handled = await service.processBatch(batch, QUEUE_ARN);

      expect(handled).toEqual([batch[0], batch[2]]);
      expect(dispatch).toHaveBeenCalledTimes(3);
      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith('Could not process message b: db down');
    });

    it('handles messages one at a time, in order', async () => {
      const { service, dispatch } = setup();
      const started: string[] = [];
      let release!: () => void;
      dispatch.mockImplementation(async (m: Message) => {
        started.push(m.MessageId!);
        if (m.MessageId === 'a') await new Promise<void>((r) => (release = r));
      });

      const processing = service.processBatch([message('a'), message('b')], QUEUE_ARN);
      await new Promise((r) => setImmediate(r));
      expect(started).toEqual(['a']);

      release();
      await expect(processing).resolves.toHaveLength(2);
      expect(started).toEqual(['a', 'b']);
    });

    it('returns nothing for an empty batch', async () => {
      const { service, dispatch } = setup();
      await expect(service.processBatch([], QUEUE_ARN)).resolves.toEqual([]);
      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  it('disables itself when the infrastructure was never provisioned', async () => {
    const infra = Promise.reject(new Error('LocalStack unreachable after 30 attempts'));
    const { service, sqsSend } = setup(infra);

    service.onModuleInit();
    await service.onModuleDestroy();

    expect(error).toHaveBeenCalledWith('Consumer disabled: infrastructure was never provisioned');
    expect(sqsSend).not.toHaveBeenCalled();
  });
});
