import type { EventActor, EventEnvelope } from './event-envelope';

const short = (id: unknown): string => (typeof id === 'string' ? id.slice(0, 8) : '-');

const describeActor = (actor?: EventActor): string => {
  if (!actor) return '-';
  return actor.type === 'user' ? `user:${short(actor.id)}(${actor.role})` : actor.type;
};

export function describeEvent(event: Partial<EventEnvelope>): string {
  return [
    event.type ?? 'unknown-event',
    `id=${short(event.eventId)}`,
    `correlation=${short(event.correlationId)}`,
    `actor=${describeActor(event.actor)}`,
  ].join(' ');
}

/**
 * Runs `work` with `console.log` muted. `commoneventframework` prints debug lines (including whole
 * message bodies) straight to the console; warnings and errors stay visible. Only safe for
 * synchronous work, which is all `buildCommonEvent` does.
 */
/* eslint-disable no-console -- swapping console.log is the whole point of this helper */
export function withQuietConsoleLog<T>(work: () => T): T {
  const original = console.log;
  console.log = () => undefined;
  try {
    return work();
  } finally {
    console.log = original;
  }
}
/* eslint-enable no-console */
