import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  DeleteMessageBatchCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { SQS_CLIENT } from '../aws/aws.tokens';
import { LocalstackBootstrapService } from '../localstack/localstack-bootstrap.service';
import { EventRouter } from './event-router.service';

/**
 * Long-polls the event queue in the background and hands each message to the `EventRouter`. A message
 * is deleted once it was handled (or dropped as malformed by the router); when a subscriber failed it
 * stays on the queue and SQS redelivers it after the visibility timeout.
 */
@Injectable()
export class EventConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumerService.name);
  private readonly abort = new AbortController();
  private loop?: Promise<void>;

  constructor(
    @Inject(SQS_CLIENT) private readonly sqs: SQSClient,
    private readonly bootstrap: LocalstackBootstrapService,
    private readonly router: EventRouter,
  ) {}

  onModuleInit(): void {
    this.loop = this.run();
  }

  async onModuleDestroy(): Promise<void> {
    this.abort.abort();
    await this.loop;
  }

  private async run(): Promise<void> {
    let queueUrl: string;
    let queueArn: string;
    try {
      ({ queueUrl, queueArn } = await this.bootstrap.infra);
    } catch {
      this.logger.error('Consumer disabled: infrastructure was never provisioned');
      return;
    }
    this.logger.log(`Polling ${queueUrl}`);

    while (!this.abort.signal.aborted) {
      try {
        const { Messages = [] } = await this.sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 20,
          }),
          { abortSignal: this.abort.signal },
        );
        const handled = await this.processBatch(Messages, queueArn);
        if (handled.length > 0) {
          await this.sqs.send(
            new DeleteMessageBatchCommand({
              QueueUrl: queueUrl,
              Entries: handled.map((m, i) => ({ Id: String(i), ReceiptHandle: m.ReceiptHandle })),
            }),
          );
        }
      } catch (err) {
        if (this.abort.signal.aborted) break;
        this.logger.warn(`Poll failed: ${(err as Error).message}. Retrying in 2s`);
        await new Promise((r) => setTimeout(r, 2_000));
      }
    }
  }

  async processBatch(messages: Message[], queueArn: string): Promise<Message[]> {
    const handled: Message[] = [];
    for (const message of messages) {
      try {
        await this.router.dispatch(message, queueArn);
        handled.push(message);
      } catch (err) {
        this.logger.error(
          `Could not process message ${message.MessageId}: ${(err as Error).message}`,
        );
      }
    }
    return handled;
  }
}
