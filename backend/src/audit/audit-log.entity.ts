import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { EventActor } from '../events/event-envelope';

/** Mirrors `audit_log` in db/init/01-schema.sql: one append-only row per event, keyed by event id. */
@Entity('audit_log')
export class AuditLog {
  @PrimaryColumn({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ type: 'varchar', length: 128 })
  type: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt: Date;

  @Column({ type: 'jsonb' })
  actor: EventActor;

  @Column({ name: 'correlation_id', type: 'varchar', length: 128 })
  correlationId: string;

  @Column({ type: 'jsonb' })
  data: object;

  @Column({ name: 'recorded_at', type: 'timestamptz', insert: false, update: false })
  recordedAt: Date;
}
