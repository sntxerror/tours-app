import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { randomUUID } from 'node:crypto';
import { EVENTBRIDGE_CLIENT } from '../aws/aws.tokens';

export interface EventEnvelope<T = unknown> {
  eventId: string;
  occurredAt: string;
  source: string;
  type: string;
  data: T;
}

@Injectable()
export class EventPublisherService {
  constructor(
    private readonly config: ConfigService,
    @Inject(EVENTBRIDGE_CLIENT) private readonly eventBridge: EventBridgeClient,
  ) {}

  async publish<T>(type: string, data: T, source = 'travel-app.api'): Promise<EventEnvelope<T>> {
    const envelope: EventEnvelope<T> = {
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      source,
      type,
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
    return envelope;
  }
}
