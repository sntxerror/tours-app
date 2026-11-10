import { Injectable } from '@nestjs/common';
import { type EventActor, SYSTEM_ACTOR } from '../events/event-envelope';
import { EventPublisherService } from '../events/event-publisher.service';
import type { VacationRequest } from './vacation-request.entity';
import { VacationStatus } from './vacation-status.enum';

export const VacationEvent = {
  Submitted: 'travel.vacation-request.submitted',
  Updated: 'travel.vacation-request.updated',
  Cancelled: 'travel.vacation-request.cancelled',
  Approved: 'travel.vacation-request.approved',
  Rejected: 'travel.vacation-request.rejected',
  Expired: 'travel.vacation-request.expired',
} as const;
export type VacationEventType = (typeof VacationEvent)[keyof typeof VacationEvent];

type Period = Pick<VacationRequest, 'startDate' | 'endDate'>;
type Change = { from: string; to: string };

/**
 * Payload common to every vacation event: ids and a small snapshot, never names, emails or the
 * free-text reason. Consumers that need more look it up by `requestId`.
 */
const snapshot = (r: VacationRequest) => ({
  requestId: r.id,
  userId: r.userId,
  startDate: r.startDate,
  endDate: r.endDate,
  status: r.status,
});

/**
 * Announces the request lifecycle on the event bus. The database is the source of truth, so the
 * lifecycle events are best-effort: a bus outage is logged and never fails the user's HTTP request.
 * The actor of each event is whoever triggered it (the requester, a validator, or the system).
 */
@Injectable()
export class VacationEventsPublisher {
  constructor(private readonly publisher: EventPublisherService) {}

  submitted(request: VacationRequest, actor: EventActor): Promise<void> {
    return this.emit(VacationEvent.Submitted, snapshot(request), actor);
  }

  /** `before` is the request as it was prior to the edit, so consumers get the diff without refetching. */
  updated(before: VacationRequest, after: VacationRequest, actor: EventActor): Promise<void> {
    const changes: { startDate?: Change; endDate?: Change } = {};
    for (const field of ['startDate', 'endDate'] as const satisfies readonly (keyof Period)[]) {
      if (before[field] !== after[field])
        changes[field] = { from: before[field], to: after[field] };
    }
    return this.emit(
      VacationEvent.Updated,
      { ...snapshot(after), changes, reasonChanged: before.reason !== after.reason },
      actor,
    );
  }

  cancelled(request: VacationRequest, actor: EventActor): Promise<void> {
    return this.emit(VacationEvent.Cancelled, snapshot(request), actor);
  }

  /** Approved or rejected, depending on the stored status. Carries the decision time and comment. */
  decided(request: VacationRequest, actor: EventActor): Promise<void> {
    const type =
      request.status === VacationStatus.Approved ? VacationEvent.Approved : VacationEvent.Rejected;
    return this.emit(
      type,
      {
        ...snapshot(request),
        decidedAt: request.updatedAt.toISOString(),
        comment: request.comments,
      },
      actor,
    );
  }

  /**
   * Unlike the others this one throws on failure: the expiry job marks a request as expired only
   * once this event is out, so a failure must be visible to it (it releases the claim and retries).
   */
  async expired(
    request: Pick<VacationRequest, 'id' | 'userId' | 'startDate' | 'endDate'> & { expiredAt: Date },
  ): Promise<void> {
    await this.publisher.publish(
      VacationEvent.Expired,
      {
        requestId: request.id,
        userId: request.userId,
        startDate: request.startDate,
        endDate: request.endDate,
        status: VacationStatus.Pending,
        expiredAt: request.expiredAt.toISOString(),
      },
      { actor: SYSTEM_ACTOR },
    );
  }

  private emit(type: VacationEventType, data: object, actor: EventActor): Promise<void> {
    return this.publisher.publishBestEffort(type, data, { actor });
  }
}
