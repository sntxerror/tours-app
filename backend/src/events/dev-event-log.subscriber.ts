import { Injectable, type OnModuleInit } from '@nestjs/common';
import { EventRouter } from './event-router.service';
import { ALL_EVENT_TYPES, DevEvent } from './event-types';
import { ReceivedEventsStore } from './received-events.store';

@Injectable()
export class DevEventLogSubscriber implements OnModuleInit {
  constructor(
    private readonly router: EventRouter,
    private readonly store: ReceivedEventsStore,
  ) {}

  onModuleInit(): void {
    this.router.subscribe({
      name: 'dev-log',
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
