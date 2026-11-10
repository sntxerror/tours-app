import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { type EventActor, SYSTEM_ACTOR } from '../events/event-envelope';
import {
  type DateChange,
  type EventPayloads,
  VacationEvent,
  type VacationSnapshot,
} from '../events/event-types';
import { OutboxService } from '../events/outbox/outbox.service';
import type { VacationRequest } from './vacation-request.entity';
import { VacationStatus } from './vacation-status.enum';

const snapshot = (r: VacationRequest): VacationSnapshot => ({
  requestId: r.id,
  userId: r.userId,
  startDate: r.startDate,
  endDate: r.endDate,
  status: r.status,
});

/**
 * Records the request lifecycle in the outbox. Every method takes the `EntityManager` of the
 * transaction that changes the request, so the event is stored atomically with the change and the
 * outbox relay publishes it afterwards. The actor is whoever triggered it (requester, validator, system).
 */
@Injectable()
export class VacationEventsPublisher {
  constructor(private readonly outbox: OutboxService) {}

  submitted(request: VacationRequest, actor: EventActor, em: EntityManager): Promise<void> {
    return this.outbox.record(VacationEvent.Submitted, snapshot(request), actor, em);
  }

  updated(
    before: VacationRequest,
    after: VacationRequest,
    actor: EventActor,
    em: EntityManager,
  ): Promise<void> {
    const changes: { startDate?: DateChange; endDate?: DateChange } = {};
    for (const field of ['startDate', 'endDate'] as const) {
      if (before[field] !== after[field])
        changes[field] = { from: before[field], to: after[field] };
    }
    const data: EventPayloads[typeof VacationEvent.Updated] = {
      ...snapshot(after),
      changes,
      reasonChanged: before.reason !== after.reason,
    };
    return this.outbox.record(VacationEvent.Updated, data, actor, em);
  }

  cancelled(request: VacationRequest, actor: EventActor, em: EntityManager): Promise<void> {
    return this.outbox.record(VacationEvent.Cancelled, snapshot(request), actor, em);
  }

  decided(request: VacationRequest, actor: EventActor, em: EntityManager): Promise<void> {
    const data = {
      ...snapshot(request),
      decidedAt: request.updatedAt.toISOString(),
      comment: request.comments,
    };
    const type =
      request.status === VacationStatus.Approved ? VacationEvent.Approved : VacationEvent.Rejected;
    return this.outbox.record(type, data, actor, em);
  }

  expired(request: VacationRequest & { expiredAt: Date }, em: EntityManager): Promise<void> {
    return this.outbox.record(
      VacationEvent.Expired,
      { ...snapshot(request), expiredAt: request.expiredAt.toISOString() },
      SYSTEM_ACTOR,
      em,
    );
  }
}
