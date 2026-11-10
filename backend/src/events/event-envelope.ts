import type { UserRole } from '../users/user-role.enum';

export const EVENT_SCHEMA_VERSION = 1;

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
  correlationId: string;
  actor: EventActor;
  data: T;
}
