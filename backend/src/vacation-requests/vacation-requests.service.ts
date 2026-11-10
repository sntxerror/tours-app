import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository, type SelectQueryBuilder } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types';
import { type Page, toPage } from '../common/pagination/page';
import type { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { UserRole } from '../users/user-role.enum';
import type { CreateVacationRequestDto } from './dto/create-vacation-request.dto';
import type {
  ListMyVacationRequestsQueryDto,
  ListVacationRequestsQueryDto,
} from './dto/list-vacation-requests-query.dto';
import type { TeamVacationsQueryDto } from './dto/team-vacations-query.dto';
import type { UpdateVacationRequestDto } from './dto/update-vacation-request.dto';
import { userActor } from '../events/event-envelope';
import { VacationEventsPublisher } from './vacation-events.publisher';
import { VacationRequest } from './vacation-request.entity';
import { assertValidPeriod } from './vacation-rules';
import { VacationStatus } from './vacation-status.enum';

/** Postgres error codes raised by constraints/triggers in db/init/01-schema.sql. */
const PG_EXCLUSION_VIOLATION = '23P01';
const PG_CHECK_VIOLATION = '23514';

const MAX_TEAM_WINDOW_DAYS = 366;

export interface TeamVacation {
  id: string;
  startDate: string;
  endDate: string;
  user: { id: string; name: string };
}

@Injectable()
export class VacationRequestsService {
  constructor(
    @InjectRepository(VacationRequest) private readonly requests: Repository<VacationRequest>,
    private readonly events: VacationEventsPublisher,
  ) {}

  // ---------------------------------------------------------------- requester

  async create(user: AuthenticatedUser, dto: CreateVacationRequestDto): Promise<VacationRequest> {
    assertValidPeriod(dto.startDate, dto.endDate);
    await this.assertNoOverlap(user.id, dto.startDate, dto.endDate);

    const saved = await this.persist(() =>
      this.requests.save(
        this.requests.create({
          userId: user.id,
          startDate: dto.startDate,
          endDate: dto.endDate,
          reason: dto.reason?.trim() || null,
        }),
      ),
    );
    void this.events.submitted(saved, userActor(user));
    return saved;
  }

  listMine(user: AuthenticatedUser, query: ListMyVacationRequestsQueryDto) {
    return this.list(query, (qb) => {
      qb.where('request.userId = :userId', { userId: user.id });
      if (query.status) qb.andWhere('request.status = :status', { status: query.status });
    });
  }

  async update(
    id: string,
    user: AuthenticatedUser,
    dto: UpdateVacationRequestDto,
  ): Promise<VacationRequest> {
    const current = await this.findOwnedOrFail(id, user);
    this.assertModifiable(current);

    const startDate = dto.startDate ?? current.startDate;
    const endDate = dto.endDate ?? current.endDate;
    // Past-date check only matters when the period actually changes; an untouched period may have started.
    const periodChanged = startDate !== current.startDate || endDate !== current.endDate;
    if (periodChanged) {
      assertValidPeriod(startDate, endDate);
      await this.assertNoOverlap(user.id, startDate, endDate, id);
    }

    const reason = dto.reason === undefined ? current.reason : dto.reason.trim() || null;
    await this.persist(async () => {
      // Guarded on status so a concurrent approval cannot be overwritten.
      const { affected } = await this.requests.update(
        { id, status: VacationStatus.Pending },
        { startDate, endDate, reason },
      );
      if (!affected) throw this.notModifiable(VacationStatus.Approved);
    });

    const updated = await this.findOrFail(id);
    void this.events.updated(current, updated, userActor(user));
    return updated;
  }

  /** Cancels (deletes) a still-pending request. */
  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const current = await this.findOwnedOrFail(id, user);
    this.assertModifiable(current);

    const { affected } = await this.requests.delete({ id, status: VacationStatus.Pending });
    if (!affected) throw this.notModifiable(VacationStatus.Approved);
    void this.events.cancelled(current, userActor(user));
  }

  // ---------------------------------------------------------------- validator

  listAll(query: ListVacationRequestsQueryDto) {
    return this.list(query, (qb) => {
      qb.where('1 = 1');
      if (query.status) qb.andWhere('request.status = :status', { status: query.status });
      if (query.userId) qb.andWhere('request.userId = :userId', { userId: query.userId });
    });
  }

  approve(id: string, validator: AuthenticatedUser, comment?: string): Promise<VacationRequest> {
    return this.decide(id, validator, VacationStatus.Approved, comment);
  }

  reject(id: string, validator: AuthenticatedUser, comment: string): Promise<VacationRequest> {
    return this.decide(id, validator, VacationStatus.Rejected, comment);
  }

  // ---------------------------------------------------------------- shared reads

  /** A requester can only see their own request; validators can see any. Others get 404, not 403. */
  async findOne(id: string, user: AuthenticatedUser): Promise<VacationRequest> {
    const found = await this.findOrFail(id);
    if (user.role !== UserRole.Validator && found.userId !== user.id) {
      throw new NotFoundException('Vacation request not found');
    }
    return found;
  }

  /** Approved vacations overlapping [from, to]; the reason and validator comments are never exposed. */
  async teamCalendar({ from, to }: TeamVacationsQueryDto): Promise<TeamVacation[]> {
    const [start, end] = this.resolveWindow(from, to);
    const rows = await this.requests
      .createQueryBuilder('request')
      .innerJoin('request.user', 'user')
      .select(['request.id', 'request.startDate', 'request.endDate', 'user.id', 'user.name'])
      .where('request.status = :status', { status: VacationStatus.Approved })
      .andWhere('request.startDate <= :end AND request.endDate >= :start', { start, end })
      .orderBy('request.startDate', 'ASC')
      .addOrderBy('user.name', 'ASC')
      .getMany();

    return rows.map(({ id, startDate, endDate, user }) => ({
      id,
      startDate,
      endDate,
      user: { id: user.id, name: user.name },
    }));
  }

  // ---------------------------------------------------------------- internals

  private async decide(
    id: string,
    validator: AuthenticatedUser,
    status: VacationStatus.Approved | VacationStatus.Rejected,
    comment?: string,
  ): Promise<VacationRequest> {
    const current = await this.findOrFail(id);
    if (current.status !== VacationStatus.Pending) {
      throw new ConflictException(`Request is already ${current.status.toLowerCase()}`);
    }
    if (status === VacationStatus.Rejected && !comment?.trim()) {
      throw new BadRequestException('A comment is required when rejecting a request');
    }

    await this.persist(async () => {
      // Atomic compare-and-set: two validators racing on the same request cannot both succeed.
      const { affected } = await this.requests.update(
        { id, status: VacationStatus.Pending },
        { status, comments: comment?.trim() || null },
      );
      if (!affected) throw new ConflictException('Request was already decided');
    });

    const decided = await this.findOrFail(id);
    void this.events.decided(decided, userActor(validator));
    return decided;
  }

  private list(
    { page, limit }: PaginationQueryDto,
    applyFilters: (qb: SelectQueryBuilder<VacationRequest>) => void,
  ): Promise<Page<VacationRequest>> {
    const qb = this.requests
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.user', 'user');
    applyFilters(qb);
    return qb
      .orderBy('request.createdAt', 'DESC')
      .addOrderBy('request.id', 'ASC') // stable order for pages
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount()
      .then(([items, total]) => toPage(items, total, { page, limit }));
  }

  private async findOrFail(id: string): Promise<VacationRequest> {
    const found = await this.requests.findOne({ where: { id }, relations: { user: true } });
    if (!found) throw new NotFoundException('Vacation request not found');
    return found;
  }

  private async findOwnedOrFail(id: string, user: AuthenticatedUser): Promise<VacationRequest> {
    const found = await this.findOrFail(id);
    if (found.userId !== user.id) throw new NotFoundException('Vacation request not found');
    return found;
  }

  /** Business rule 3: approved requests are frozen. Rejected ones are final too: submit a new one. */
  private assertModifiable(request: VacationRequest): void {
    if (request.status !== VacationStatus.Pending) throw this.notModifiable(request.status);
  }

  private notModifiable(status: VacationStatus): ConflictException {
    return new ConflictException(
      status === VacationStatus.Rejected
        ? 'Rejected requests cannot be modified; submit a new request instead'
        : 'Approved requests cannot be modified',
    );
  }

  /** Business rule 2: no overlap with the user's own pending/approved requests (rejected ones are ignored). */
  private async assertNoOverlap(
    userId: string,
    startDate: string,
    endDate: string,
    excludeId?: string,
  ): Promise<void> {
    const qb = this.requests
      .createQueryBuilder('request')
      .where('request.userId = :userId', { userId })
      .andWhere('request.status <> :rejected', { rejected: VacationStatus.Rejected })
      .andWhere('request.startDate <= :endDate AND request.endDate >= :startDate', {
        startDate,
        endDate,
      });
    if (excludeId) qb.andWhere('request.id <> :excludeId', { excludeId });

    const clash = await qb.getOne();
    if (clash) throw this.overlapError(clash);
  }

  private overlapError(clash: Pick<VacationRequest, 'startDate' | 'endDate' | 'status'>) {
    return new ConflictException(
      `Dates overlap with your ${clash.status.toLowerCase()} request (${clash.startDate} to ${clash.endDate})`,
    );
  }

  /** Maps database-level guards (the safety net behind the checks above, e.g. under races) to HTTP errors. */
  private async persist<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (err) {
      const code =
        err instanceof QueryFailedError ? (err.driverError as { code?: string })?.code : undefined;
      if (code === PG_EXCLUSION_VIOLATION) {
        throw new ConflictException('Dates overlap with another of your requests');
      }
      if (code === PG_CHECK_VIOLATION) {
        throw new ConflictException(
          'Request violates a business rule (approved requests are frozen)',
        );
      }
      throw err;
    }
  }

  private resolveWindow(from?: string, to?: string): [string, string] {
    const today = new Date();
    const start =
      from ??
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const end =
      to ??
      new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))
        .toISOString()
        .slice(0, 10);
    if (end < start) throw new BadRequestException('"to" must not be before "from"');

    const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
    if (days > MAX_TEAM_WINDOW_DAYS) {
      throw new BadRequestException(`Date window cannot exceed ${MAX_TEAM_WINDOW_DAYS} days`);
    }
    return [start, end];
  }
}
