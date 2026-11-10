import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { randomUUID } from 'node:crypto';
import { EVENTBRIDGE_CLIENT } from '../aws/aws.tokens';
import { getRequestContext } from '../common/request-context/request-context';
import { LocalstackBootstrapService } from '../localstack/localstack-bootstrap.service';
import { EVENT_SCHEMA_VERSION, type EventActor, type EventEnvelope } from './event-envelope';
import { describeEvent } from './event-log';

export const DEFAULT_EVENT_SOURCE = 'travel-app.api';

export interface PublishOptions {
  actor: EventActor;
  source?: string;
}

@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly bootstrap: LocalstackBootstrapService,
    @Inject(EVENTBRIDGE_CLIENT) private readonly eventBridge: EventBridgeClient,
  ) {}

  /** Publishes one event and throws if the bus rejects it. Use for events that must not be lost silently. */
  async publish<T>(
    type: string,
    data: T,
    { actor, source = DEFAULT_EVENT_SOURCE }: PublishOptions,
  ): Promise<EventEnvelope<T>> {
    // Events raised while the bus is still being provisioned wait for it instead of failing.
    await this.bootstrap.infra;

    const envelope: EventEnvelope<T> = {
      eventId: randomUUID(),
      schemaVersion: EVENT_SCHEMA_VERSION,
      occurredAt: new Date().toISOString(),
      source,
      type,
      correlationId: getRequestContext()?.correlationId ?? randomUUID(),
      actor,
      data,
    };

    const result = await this.eventBridge.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.config.getOrThrow<string>('EVENT_BUS_NAME'),
            Source: source,
            DetailType: type,
            Detail: JSON.stringify(envelope),
          },
        ],
      }),
    );

    if (result.FailedEntryCount) {
      const failed = result.Entries?.[0];
      throw new Error(`PutEvents failed: ${failed?.ErrorCode} ${failed?.ErrorMessage}`);
    }
    this.logger.log(`Published ${describeEvent(envelope)}`);
    return envelope;
  }

  /**
   * Fire-and-forget variant for announcements of facts already stored in the database: a bus outage is
   * logged and never fails the caller's request.
   */
  async publishBestEffort<T>(type: string, data: T, options: PublishOptions): Promise<void> {
    try {
      await this.publish(type, data, options);
    } catch (err) {
      this.logger.warn(`Could not publish ${type}: ${(err as Error).message}`);
    }
  }
}
