import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { EventRouter } from '../events/event-router.service';
import { ALL_EVENT_TYPES } from '../events/event-types';
import { AuditService } from './audit.service';

/** Subscribes the audit trail to every event type; the router calls it for each message from the queue. */
@Injectable()
export class AuditSubscriber implements OnModuleInit {
  private readonly logger = new Logger(AuditSubscriber.name);

  constructor(
    private readonly router: EventRouter,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.router.subscribe({
      name: 'audit-log',
      types: ALL_EVENT_TYPES,
      handle: async (envelope) => {
        const written = await this.audit.record(envelope);
        if (!written)
          this.logger.debug(`Duplicate delivery of ${envelope.eventId}, already recorded`);
      },
    });
  }
}
