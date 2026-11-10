import type { UserRole } from '../users/user-role.enum';

/** Bump when the envelope shape changes incompatibly; consumers branch on it. */
export const EVENT_SCHEMA_VERSION = 1;

/** Who caused the event: a signed-in user, a background job, or someone not authenticated (e.g. a failed login). */
export type EventActor =
  { type: 'user'; id: string; role: UserRole } | { type: 'system' } | { type: 'anonymous' };

export const SYSTEM_ACTOR: EventActor = { type: 'system' };
export const ANONYMOUS_ACTOR: EventActor = { type: 'anonymous' };

export const userActor = (user: { id: string; role: UserRole }): EventActor => ({
  type: 'user',
  id: user.id,
  role: user.role,
});

export interface EventEnvelope<T = unknown> {
  eventId: string;
  schemaVersion: typeof EVENT_SCHEMA_VERSION;
  occurredAt: string;
  source: string;
  type: string;
  /** Ties together everything caused by one HTTP request or one job run. */
  correlationId: string;
  actor: EventActor;
  data: T;
}
