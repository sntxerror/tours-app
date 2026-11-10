import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { EventEnvelope } from '../events/event-envelope';
import { EventRouter } from '../events/event-router.service';
import { VacationEvent, type VacationSnapshot } from '../events/event-types';

const OUTCOMES: Record<string, string> = {
  [VacationEvent.Approved]: 'was approved',
  [VacationEvent.Rejected]: 'was rejected',
  [VacationEvent.Expired]: 'started before anyone decided on it',
};

/**
 * Tells requesters what happened to their request. Stands in for an email/push sender: it only logs
 * the message it would send. A real sender would key each message on `eventId`, because the queue
 * may deliver the same event twice.
 */
@Injectable()
export class NotificationsSubscriber implements OnModuleInit {
  private readonly logger = new Logger(NotificationsSubscriber.name);

  constructor(private readonly router: EventRouter) {}

  onModuleInit(): void {
    this.router.subscribe({
      name: 'notifications',
      types: [VacationEvent.Approved, VacationEvent.Rejected, VacationEvent.Expired],
      handle: async (envelope) => this.notify(envelope as EventEnvelope<VacationSnapshot>),
    });
  }

  private notify({ type, data }: EventEnvelope<VacationSnapshot>): void {
    this.logger.log(
      `Would notify user ${data.userId}: your request ${data.requestId} ${OUTCOMES[type]}`,
    );
  }
}
