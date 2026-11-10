import { Column, Entity, PrimaryColumn } from 'typeorm';
import { EVENT_SCHEMA_VERSION, type EventActor, type EventEnvelope } from '../event-envelope';
import { DEFAULT_EVENT_SOURCE } from '../event-publisher.service';

/** Mirrors `event_outbox` in db/init/01-schema.sql. `id` doubles as the event id. */
@Entity('event_outbox')
export class OutboxEvent {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'varchar', length: 128 })
  type: string;

  @Column({ type: 'jsonb' })
  actor: EventActor;

  @Column({ name: 'correlation_id', type: 'varchar', length: 128 })
  correlationId: string;

  @Column({ type: 'jsonb' })
  data: object;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  /** How often the bus rejected this event; the relay parks it after a few. */
  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;
}

/** The envelope consumers receive; identical on every (re)delivery because it is rebuilt from the row. */
export const toEnvelope = (row: OutboxEvent): EventEnvelope => ({
  eventId: row.id,
  schemaVersion: EVENT_SCHEMA_VERSION,
  occurredAt: row.occurredAt.toISOString(),
  source: DEFAULT_EVENT_SOURCE,
  type: row.type,
  correlationId: row.correlationId,
  actor: row.actor,
  data: row.data,
});
