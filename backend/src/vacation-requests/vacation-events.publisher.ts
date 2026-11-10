import { Injectable, Logger } from '@nestjs/common';
import { EventPublisherService } from '../events/event-publisher.service';
import type { VacationRequest } from './vacation-request.entity';

export const VacationEvent = {
  Submitted: 'travel.vacation-request.submitted',
  Updated: 'travel.vacation-request.updated',
  Cancelled: 'travel.vacation-request.cancelled',
  Approved: 'travel.vacation-request.approved',
  Rejected: 'travel.vacation-request.rejected',
} as const;
export type VacationEventType = (typeof VacationEvent)[keyof typeof VacationEvent];

/**
 * Announces the request lifecycle on the event bus. Publishing is best-effort: the database is the
 * source of truth, so a bus outage is logged and must never fail the user's HTTP request.
 */
@Injectable()
export class VacationEventsPublisher {
  private readonly logger = new Logger(VacationEventsPublisher.name);

  constructor(private readonly publisher: EventPublisherService) {}

  async emit(type: VacationEventType, request: VacationRequest, actorId: string): Promise<void> {
    try {
      await this.publisher.publish(type, {
        requestId: request.id,
        userId: request.userId,
        startDate: request.startDate,
        endDate: request.endDate,
        status: request.status,
        comment: request.comments,
        actorId,
      });
    } catch (err) {
      this.logger.warn(`Could not publish ${type} for ${request.id}: ${(err as Error).message}`);
    }
  }
}
