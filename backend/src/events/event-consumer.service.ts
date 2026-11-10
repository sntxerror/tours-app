import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  DeleteMessageBatchCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { buildCommonEvent } from 'commoneventframework';
import type { LambdaEvent } from 'commoneventframework/dist/types/commonEvent';
import { SQS_CLIENT } from '../aws/aws.tokens';
import { LocalstackBootstrapService } from '../localstack/localstack-bootstrap.service';
import { ReceivedEventsStore } from './received-events.store';

/** Long-polls the local queue in the background and deletes messages once handled. */
@Injectable()
export class EventConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventConsumerService.name);
  private readonly abort = new AbortController();
  private loop?: Promise<void>;

  constructor(
    @Inject(SQS_CLIENT) private readonly sqs: SQSClient,
    private readonly bootstrap: LocalstackBootstrapService,
    private readonly store: ReceivedEventsStore,
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
    try {
      ({ queueUrl } = await this.bootstrap.infra);
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
        if (Messages.length === 0) continue;

        const handled = Messages.filter((m) => this.handle(m));
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

  /** Returns true when the message was processed and may be deleted. */
  private handle(message: Message): boolean {
    try {
      const body = message.Body ?? '';
      // Normalise through commoneventframework exactly as a Lambda SQS trigger would.
      const common = buildCommonEvent(
        { Records: [{ eventSource: 'aws:sqs', body }] } as unknown as LambdaEvent,
        new Set(),
      );
      const envelope = JSON.parse(common.body ?? body);
      this.store.add({
        receivedAt: new Date().toISOString(),
        commonEventVersion: common.version,
        envelope,
      });
      this.logger.log(`Received event:\n${JSON.stringify(envelope, null, 2)}`);
      return true;
    } catch (err) {
      // Leave it on the queue; SQS redelivers after the visibility timeout.
      this.logger.error(`Failed to process ${message.MessageId}: ${(err as Error).message}`);
      return false;
    }
  }
}
