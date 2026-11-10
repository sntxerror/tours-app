import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, type Repository } from 'typeorm';
import { EventPublisherService, EventRejectedError } from '../event-publisher.service';
import { OutboxEvent, toEnvelope } from './outbox-event.entity';

export const OUTBOX_BATCH_SIZE = 50;
/** A row the bus rejects this many times is parked (left unsent, logged) so it cannot block the rest. */
export const OUTBOX_MAX_REJECTIONS = 5;

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_RETENTION_DAYS = 7;
const PURGE_EVERY_MS = 60 * 60 * 1000;
const SHUTDOWN_FLUSH_MS = 5_000;

/**
 * Publishes recorded events to the bus: polls the outbox, sends unsent rows oldest first and marks
 * them published. Delivery is at-least-once (a crash after sending but before marking resends), so
 * consumers de-duplicate on the stable event id.
 *
 * Several API instances can run it: rows are claimed with `FOR UPDATE SKIP LOCKED`.
 */
@Injectable()
export class OutboxRelayService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer?: NodeJS.Timeout;
  private inFlight?: Promise<void>;
  private stopped = false;
  private enabled = false;
  private lastPurge = 0;

  constructor(
    @InjectRepository(OutboxEvent) private readonly outbox: Repository<OutboxEvent>,
    private readonly publisher: EventPublisherService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!(this.pollIntervalMs() > 0)) {
      this.logger.log('Outbox relay disabled (OUTBOX_POLL_INTERVAL_MS <= 0)');
      return;
    }
    this.enabled = true;
    this.schedule(0);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.inFlight;
    if (!this.enabled) return;
    try {
      await Promise.race([
        this.drain(),
        new Promise((resolve) => setTimeout(resolve, SHUTDOWN_FLUSH_MS).unref()),
      ]);
    } catch (err) {
      this.logger.warn(`Final outbox flush failed: ${(err as Error).message}`);
    }
  }

  private pollIntervalMs(): number {
    return Number(this.config.get('OUTBOX_POLL_INTERVAL_MS') ?? DEFAULT_POLL_INTERVAL_MS);
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => {
      this.inFlight = this.tick();
    }, delayMs);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    let delay = this.pollIntervalMs();
    try {
      const { sent, claimed } = await this.drain();
      if (claimed === OUTBOX_BATCH_SIZE && sent === claimed) delay = 0;
      await this.purgeIfDue();
    } catch (err) {
      this.logger.warn(`Outbox relay run failed: ${(err as Error).message}`);
    }
    this.schedule(delay);
  }

  async drain(): Promise<{ claimed: number; sent: number }> {
    return this.outbox.manager.transaction(async (em) => {
      const repo = em.getRepository(OutboxEvent);
      const rows = await repo
        .createQueryBuilder('event')
        .setLock('pessimistic_write')
        .setOnLocked('skip_locked')
        .where('event.publishedAt IS NULL')
        .andWhere('event.attempts < :max', { max: OUTBOX_MAX_REJECTIONS })
        .orderBy('event.occurredAt', 'ASC')
        .addOrderBy('event.id', 'ASC')
        .limit(OUTBOX_BATCH_SIZE)
        .getMany();

      let sent = 0;
      for (const row of rows) {
        try {
          await this.publisher.send(toEnvelope(row));
          await repo.update({ id: row.id }, { publishedAt: () => 'now()', lastError: null });
          sent++;
        } catch (err) {
          const message = (err as Error).message;
          if (!(err instanceof EventRejectedError)) {
            this.logger.warn(
              `Bus unreachable, ${rows.length - sent} event(s) stay queued: ${message}`,
            );
            break;
          }
          await repo.update({ id: row.id }, { attempts: () => 'attempts + 1', lastError: message });
          const parked = row.attempts + 1 >= OUTBOX_MAX_REJECTIONS;
          this.logger.error(
            `Bus rejected ${row.type} ${row.id}${parked ? ', parking it for manual attention' : ''}: ${message}`,
          );
        }
      }
      return { claimed: rows.length, sent };
    });
  }

  private async purgeIfDue(): Promise<void> {
    if (Date.now() - this.lastPurge < PURGE_EVERY_MS) return;
    this.lastPurge = Date.now();
    const days = Number(this.config.get('OUTBOX_RETENTION_DAYS') ?? DEFAULT_RETENTION_DAYS);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { affected } = await this.outbox.delete({ publishedAt: LessThan(cutoff) });
    if (affected)
      this.logger.log(`Purged ${affected} published outbox row(s) older than ${days} day(s)`);
  }
}
