import { Injectable } from '@nestjs/common';

export interface ReceivedEvent {
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
    this.items.unshift(event);
    if (this.items.length > ReceivedEventsStore.LIMIT) this.items.pop();
  }

  list(): readonly ReceivedEvent[] {
    return this.items;
  }
}
