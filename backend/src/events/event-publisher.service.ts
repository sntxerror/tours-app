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

/**
 * The bus refused this particular event (as opposed to being unreachable). Retrying it as is will
 * not help, which is what lets the outbox relay park a bad row instead of blocking everything behind it.
 */
export class EventRejectedError extends Error {}

/** Sends envelopes to EventBridge. Application code does not call this: it records into the outbox. */
@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly bootstrap: LocalstackBootstrapService,
    @Inject(EVENTBRIDGE_CLIENT) private readonly eventBridge: EventBridgeClient,
  ) {}

  buildEnvelope<T>(
    type: string,
    data: T,
    { actor, source = DEFAULT_EVENT_SOURCE }: PublishOptions,
  ): EventEnvelope<T> {
    return {
      eventId: randomUUID(),
      schemaVersion: EVENT_SCHEMA_VERSION,
      occurredAt: new Date().toISOString(),
      source,
      type,
      correlationId: getRequestContext()?.correlationId ?? randomUUID(),
      actor,
      data,
    };
  }

  /** Builds and sends one event right away, throwing if it cannot be delivered. Used by the dev ping. */
  async publish<T>(type: string, data: T, options: PublishOptions): Promise<EventEnvelope<T>> {
    const envelope = this.buildEnvelope(type, data, options);
    await this.send(envelope);
    return envelope;
  }

  /**
   * Sends an existing envelope. Throws `EventRejectedError` when the bus rejects the entry and any
   * other error when it cannot be reached.
   */
  async send(envelope: EventEnvelope): Promise<void> {
    // Events raised while the bus is still being provisioned wait for it instead of failing.
    await this.bootstrap.infra;

    const result = await this.eventBridge.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: this.config.getOrThrow<string>('EVENT_BUS_NAME'),
            Source: envelope.source,
            DetailType: envelope.type,
            Detail: JSON.stringify(envelope),
          },
        ],
      }),
    );

    if (result.FailedEntryCount) {
      const failed = result.Entries?.[0];
      throw new EventRejectedError(
        `PutEvents failed: ${failed?.ErrorCode} ${failed?.ErrorMessage}`,
      );
    }
    this.logger.log(`Published ${describeEvent(envelope)}`);
  }
}
