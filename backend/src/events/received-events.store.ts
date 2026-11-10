import { Injectable } from '@nestjs/common';

export interface ReceivedEvent {
  /** When given, an event delivered a second time (SQS is at-least-once) is not listed twice. */
  eventId?: string;
  receivedAt: string;
  commonEventVersion: string;
  envelope: unknown;
}

/** Bounded in-memory log so the test page can display what the worker consumed. */
@Injectable()
export class ReceivedEventsStore {
  private static readonly LIMIT = 50;
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
