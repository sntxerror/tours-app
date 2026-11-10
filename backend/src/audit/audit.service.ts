import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { type Page, toPage } from '../common/pagination/page';
import type { EventEnvelope } from '../events/event-envelope';
import { AuditLog } from './audit-log.entity';
import type { ListAuditLogQueryDto } from './dto/list-audit-log-query.dto';

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly log: Repository<AuditLog>) {}

  /**
   * Idempotent: the event id is the primary key, so a redelivered event is silently ignored.
   * Returns whether a new row was written.
   */
  async record(event: EventEnvelope): Promise<boolean> {
    const result = await this.log
      .createQueryBuilder()
      .insert()
      .values({
        eventId: event.eventId,
        type: event.type,
        occurredAt: new Date(event.occurredAt),
        actor: event.actor,
        correlationId: event.correlationId,
        data: event.data as object,
      })
      .orIgnore()
      // ON CONFLICT DO NOTHING returns no row for a duplicate, which is how it is told apart.
      .returning(['eventId'])
      .execute();
    return result.raw.length > 0;
  }

  /** Newest first. */
  async list(query: ListAuditLogQueryDto): Promise<Page<AuditLog>> {
    const { page, limit, type, correlationId, requestId } = query;
    const qb = this.log.createQueryBuilder('entry').where('1 = 1');
    if (type) qb.andWhere('entry.type = :type', { type });
    if (correlationId) qb.andWhere('entry.correlationId = :correlationId', { correlationId });
    if (requestId) qb.andWhere("entry.data ->> 'requestId' = :requestId", { requestId });

    const [items, total] = await qb
      .orderBy('entry.occurredAt', 'DESC')
      .addOrderBy('entry.eventId', 'ASC') // stable order for pages
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return toPage(items, total, { page, limit });
  }
}
