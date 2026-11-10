import { Injectable, type OnModuleInit } from '@nestjs/common';
import { EventRouter } from './event-router.service';
import { ALL_EVENT_TYPES, DevEvent } from './event-types';
import { ReceivedEventsStore } from './received-events.store';

/** Keeps the last events in memory for the dev-only `/api/test/events` endpoint and the /events-test page. */
@Injectable()
export class DevEventLogSubscriber implements OnModuleInit {
  constructor(
    private readonly router: EventRouter,
    private readonly store: ReceivedEventsStore,
  ) {}

  onModuleInit(): void {
    this.router.subscribe({
      name: 'dev-log',
      // Business events plus the dev ping, so the /events-test page's button shows a round trip.
      types: [...ALL_EVENT_TYPES, DevEvent.Ping],
      handle: async (envelope, delivery) => {
        this.store.add({
          eventId: envelope.eventId,
          receivedAt: new Date().toISOString(),
          commonEventVersion: delivery.commonEventVersion,
          envelope: delivery.body,
        });
      },
    });
  }
}
