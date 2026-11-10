import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateEventBusCommand,
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  ResourceAlreadyExistsException,
} from '@aws-sdk/client-eventbridge';
import {
  CreateQueueCommand,
  GetQueueAttributesCommand,
  SQSClient,
  SetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';
import { EVENTBRIDGE_CLIENT, SQS_CLIENT } from '../aws/aws.tokens';

const MAX_ATTEMPTS = 30;
const MAX_DELAY_MS = 5_000;

export interface ProvisionedInfra {
  busName: string;
  queueUrl: string;
  queueArn: string;
}

/**
 * Idempotently provisions bus -> rule -> SQS queue on boot. Retries with
 * backoff while LocalStack is still starting. Consumers `await infra`.
 */
@Injectable()
export class LocalstackBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(LocalstackBootstrapService.name);
  private resolveInfra!: (infra: ProvisionedInfra) => void;
  private rejectInfra!: (err: unknown) => void;

  readonly infra = new Promise<ProvisionedInfra>((resolve, reject) => {
    this.resolveInfra = resolve;
    this.rejectInfra = reject;
  });

  constructor(
    private readonly config: ConfigService,
    @Inject(EVENTBRIDGE_CLIENT) private readonly eventBridge: EventBridgeClient,
    @Inject(SQS_CLIENT) private readonly sqs: SQSClient,
  ) {
    // Avoid unhandled-rejection noise if nobody awaits yet.
    this.infra.catch(() => undefined);
  }

  onModuleInit(): void {
    // Not awaited on purpose: the HTTP server must come up even if LocalStack is slow.
    void this.provisionWithRetry();
  }

  private async provisionWithRetry(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const infra = await this.provision();
        this.logger.log(`Provisioned bus="${infra.busName}" queue="${infra.queueUrl}"`);
        this.resolveInfra(infra);
        return;
      } catch (err) {
        const delay = Math.min(500 * 2 ** (attempt - 1), MAX_DELAY_MS);
        this.logger.warn(
          `LocalStack not ready (attempt ${attempt}/${MAX_ATTEMPTS}): ${(err as Error).message}. Retrying in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    const error = new Error(`LocalStack unreachable after ${MAX_ATTEMPTS} attempts`);
    this.logger.error(error.message);
    this.rejectInfra(error);
  }

  private async provision(): Promise<ProvisionedInfra> {
    const busName = this.config.getOrThrow<string>('EVENT_BUS_NAME');
    const queueName = this.config.getOrThrow<string>('EVENT_QUEUE_NAME');
    const ruleName = this.config.getOrThrow<string>('EVENT_RULE_NAME');

    try {
      await this.eventBridge.send(new CreateEventBusCommand({ Name: busName }));
    } catch (err) {
      // LocalStack state survives restarts (named volume), so the bus may already exist.
      if (!(err instanceof ResourceAlreadyExistsException)) throw err;
    }

    const { QueueUrl } = await this.sqs.send(new CreateQueueCommand({ QueueName: queueName }));
    if (!QueueUrl) throw new Error('CreateQueue returned no QueueUrl');
    const attrs = await this.sqs.send(
      new GetQueueAttributesCommand({ QueueUrl, AttributeNames: ['QueueArn'] }),
    );
    const queueArn = attrs.Attributes?.QueueArn;
    if (!queueArn) throw new Error('Queue has no ARN');

    // Allow EventBridge to deliver to the queue (mirrors real AWS requirements).
    await this.sqs.send(
      new SetQueueAttributesCommand({
        QueueUrl,
        Attributes: {
          Policy: JSON.stringify({
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Principal: { Service: 'events.amazonaws.com' },
                Action: 'sqs:SendMessage',
                Resource: queueArn,
              },
            ],
          }),
        },
      }),
    );

    // EventBridge forbids an empty pattern; a prefix match on `source` matches every event.
    await this.eventBridge.send(
      new PutRuleCommand({
        Name: ruleName,
        EventBusName: busName,
        State: 'ENABLED',
        EventPattern: JSON.stringify({ source: [{ prefix: '' }] }),
      }),
    );
    await this.eventBridge.send(
      new PutTargetsCommand({
        Rule: ruleName,
        EventBusName: busName,
        Targets: [{ Id: 'sqs-target', Arn: queueArn }],
      }),
    );

    return { busName, queueUrl: QueueUrl, queueArn };
  }
}
