import type { EventActor, EventEnvelope } from './event-envelope';

/** Enough of an id to grep for, short enough to keep log lines readable. */
const short = (id: unknown): string => (typeof id === 'string' ? id.slice(0, 8) : '-');

const describeActor = (actor?: EventActor): string => {
  if (!actor) return '-';
  return actor.type === 'user' ? `user:${short(actor.id)}(${actor.role})` : actor.type;
};

/**
 * One-line summary of an event for logs, e.g.
 * `travel.vacation-request.approved id=3f2a9c1e correlation=7b1d0e44 actor=user:00000000(Validator)`.
 * Payloads are deliberately left out: they can hold personal data and make logs unreadable.
 * Tolerates envelopes from older publishers that lack newer fields.
 */
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
