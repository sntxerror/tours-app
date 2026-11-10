import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, Repository } from 'typeorm';
import { runWithRequestContext } from '../common/request-context/request-context';
import { VacationEventsPublisher } from './vacation-events.publisher';
import { VacationRequest } from './vacation-request.entity';
import { VacationStatus } from './vacation-status.enum';
import { todayIso } from './vacation-rules';

const DEFAULT_INTERVAL_SECONDS = 600;

/**
 * Finds requests still Pending after their start date and announces each exactly once with a
 * `vacation-request.expired` event. The status is left alone (a validator may still want to decide):
 * `expired_at` marks that the event was raised. Editing the period clears it, so a request that gets
 * new dates can expire again.
 *
 * The marker and the event are written in one transaction, so they cannot diverge, and the claim is
 * a single atomic `UPDATE ... RETURNING`, so several API instances never raise the event twice.
 */
@Injectable()
export class VacationExpiryService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(VacationExpiryService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(VacationRequest) private readonly requests: Repository<VacationRequest>,
    private readonly events: VacationEventsPublisher,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = Number(
      this.config.get('VACATION_EXPIRY_INTERVAL_SECONDS') ?? DEFAULT_INTERVAL_SECONDS,
    );
    if (!(seconds > 0)) {
      this.logger.log('Expiry job disabled (VACATION_EXPIRY_INTERVAL_SECONDS <= 0)');
      return;
    }
    const run = () => void this.runJob();
    run();
    this.timer = setInterval(run, seconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** One scheduled run: its own correlation id ties together every event it records. */
  private async runJob(): Promise<void> {
    try {
      const count = await runWithRequestContext({ correlationId: randomUUID() }, () =>
        this.expireOverdue(),
      );
      if (count > 0) this.logger.log(`Expired ${count} overdue pending request(s)`);
    } catch (err) {
      this.logger.error(`Expiry run failed: ${(err as Error).message}`);
    }
  }

  /** Returns how many requests were expired in this run. */
  expireOverdue(today = todayIso()): Promise<number> {
    return this.requests.manager.transaction(async (em) => {
      // Only ids come back from the UPDATE: raw `date` columns would arrive as timezone-shifted
      // `Date` objects, so the rows are reloaded through the entity, which keeps `YYYY-MM-DD` strings.
      const result = await em
        .createQueryBuilder()
        .update(VacationRequest)
        .set({ expiredAt: () => 'now()' })
        .where('status = :status', { status: VacationStatus.Pending })
        .andWhere('expired_at IS NULL')
        .andWhere('start_date < :today', { today })
        .returning(['id'])
        .execute();
      const ids = (result.raw as { id: string }[]).map((row) => row.id);
      if (ids.length === 0) return 0;

      const expired = await em.getRepository(VacationRequest).findBy({ id: In(ids) });
      for (const request of expired) {
        await this.events.expired({ ...request, expiredAt: request.expiredAt ?? new Date() }, em);
      }
      return expired.length;
    });
  }
}
