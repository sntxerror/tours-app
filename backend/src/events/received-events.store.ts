import { Injectable } from '@nestjs/common';

export interface ReceivedEvent {
  eventId?: string;
  receivedAt: string;
  commonEventVersion: string;
  envelope: unknown;
}

@Injectable()
export class ReceivedEventsStore {
  private static readonly LIMIT = 200;
  private readonly items: ReceivedEvent[] = [];

  add(event: ReceivedEvent): void {
    if (event.eventId && this.items.some((item) => item.eventId === event.eventId)) return;
    this.items.unshift(event);
    if (this.items.length > ReceivedEventsStore.LIMIT) this.items.pop();
  }

  list(): readonly ReceivedEvent[] {
    return this.items;
  }
}
