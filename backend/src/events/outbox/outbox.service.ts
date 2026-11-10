import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import type { EntityManager, Repository } from 'typeorm';
import { getRequestContext } from '../../common/request-context/request-context';
import type { EventActor } from '../event-envelope';
import type { EventPayloads, EventType } from '../event-types';
import { OutboxEvent } from './outbox-event.entity';

/**
 * Records events in the outbox instead of publishing them. Pass the `EntityManager` of the
 * transaction that makes the change the event describes: the event then commits or rolls back with
 * it, and the relay (`OutboxRelayService`) publishes it afterwards.
 */
@Injectable()
export class OutboxService {
  constructor(@InjectRepository(OutboxEvent) private readonly outbox: Repository<OutboxEvent>) {}

  async record<K extends EventType>(
    type: K,
    data: EventPayloads[K],
    actor: EventActor,
    em: EntityManager = this.outbox.manager,
  ): Promise<void> {
    await em.insert(OutboxEvent, {
      id: randomUUID(),
      type,
      actor,
      correlationId: getRequestContext()?.correlationId ?? randomUUID(),
      data,
      occurredAt: new Date(),
    });
  }
}
