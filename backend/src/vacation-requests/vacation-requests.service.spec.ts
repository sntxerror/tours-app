import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError, type Repository } from 'typeorm';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../users/user-role.enum';
import type { VacationEventsPublisher } from './vacation-events.publisher';
import type { VacationRequest } from './vacation-request.entity';
import { VacationRequestsService } from './vacation-requests.service';
import { VacationStatus } from './vacation-status.enum';

const alice: AuthenticatedUser = { id: 'u-alice', role: UserRole.Requester };
const bob: AuthenticatedUser = { id: 'u-bob', role: UserRole.Requester };
const carol: AuthenticatedUser = { id: 'u-carol', role: UserRole.Validator };

const FUTURE_START = '2099-05-01';
const FUTURE_END = '2099-05-05';

const makeRequest = (over: Partial<VacationRequest> = {}): VacationRequest =>
  ({
    id: 'r-1',
    userId: alice.id,
    startDate: FUTURE_START,
    endDate: FUTURE_END,
    reason: null,
    status: VacationStatus.Pending,
    comments: null,
    expiredAt: null,
    ...over,
  }) as VacationRequest;

function queryBuilder(result: { one?: unknown; many?: unknown[]; count?: number } = {}) {
  const qb: Record<string, jest.Mock> = {};
  for (const m of [
    'where',
    'andWhere',
    'leftJoinAndSelect',
    'innerJoin',
    'select',
    'orderBy',
    'addOrderBy',
    'skip',
    'take',
  ]) {
    qb[m] = jest.fn(() => qb);
  }
  qb.getOne = jest.fn().mockResolvedValue(result.one ?? null);
  qb.getMany = jest.fn().mockResolvedValue(result.many ?? []);
  qb.getManyAndCount = jest
    .fn()
    .mockResolvedValue([result.many ?? [], result.count ?? (result.many ?? []).length]);
  return qb;
}

function setup(
  opts: {
    found?: VacationRequest | null;
    findAfter?: VacationRequest;
    qb?: ReturnType<typeof queryBuilder>;
  } = {},
) {
  const qb = opts.qb ?? queryBuilder();
  const found = opts.found === undefined ? makeRequest() : opts.found;
  const requests = {
    createQueryBuilder: jest.fn(() => qb),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ id: 'r-new', status: VacationStatus.Pending, ...v })),
    findOne: jest
      .fn()
      .mockResolvedValueOnce(found)
      .mockResolvedValue(opts.findAfter ?? found),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  // The service runs each change in a transaction: the fake one hands the same repository back.
  const em = { getRepository: () => requests };
  const transaction = jest.fn(async (work: (m: typeof em) => Promise<unknown>) => work(em));
  Object.assign(requests, { manager: { transaction } });
  const events = {
    submitted: jest.fn().mockResolvedValue(undefined),
    updated: jest.fn().mockResolvedValue(undefined),
    cancelled: jest.fn().mockResolvedValue(undefined),
    decided: jest.fn().mockResolvedValue(undefined),
  };
  const service = new VacationRequestsService(
    requests as unknown as Repository<VacationRequest>,
    events as unknown as VacationEventsPublisher,
  );
  return { service, requests, events, qb, em, transaction };
}

const pgError = (code: string) =>
  new QueryFailedError('query', [], Object.assign(new Error('db'), { code }));

describe('VacationRequestsService.create', () => {
  it('saves a trimmed reason, announces the submission and returns the request', async () => {
    const { service, requests, events } = setup();
    const saved = await service.create(alice, {
      startDate: FUTURE_START,
      endDate: FUTURE_END,
      reason: '  family trip ',
    });

    expect(requests.create).toHaveBeenCalledWith({
      userId: alice.id,
      startDate: FUTURE_START,
      endDate: FUTURE_END,
      reason: 'family trip',
    });
    expect(events.submitted).toHaveBeenCalledWith(
      saved,
      { type: 'user', id: alice.id, role: UserRole.Requester },
      expect.anything(),
    );
  });

  it.each([undefined, '', '   '])('stores a null reason for %p', async (reason) => {
    const { service, requests } = setup();
    await service.create(alice, { startDate: FUTURE_START, endDate: FUTURE_END, reason });
    expect(requests.create).toHaveBeenCalledWith(expect.objectContaining({ reason: null }));
  });

  it('rejects an invalid period before touching the database', async () => {
    const { service, requests, qb } = setup();
    await expect(
      service.create(alice, { startDate: FUTURE_END, endDate: FUTURE_START }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.create(alice, { startDate: '2000-01-01', endDate: '2000-01-05' }),
    ).rejects.toThrow('in the past');
    expect(qb.getOne).not.toHaveBeenCalled();
    expect(requests.save).not.toHaveBeenCalled();
  });

  it('rejects dates overlapping an existing pending or approved request, naming it', async () => {
    const clash = makeRequest({ status: VacationStatus.Approved });
    const { service, requests, events, qb } = setup({ qb: queryBuilder({ one: clash }) });

    await expect(
      service.create(alice, { startDate: FUTURE_START, endDate: FUTURE_END }),
    ).rejects.toThrow(
      new ConflictException(
        `Dates overlap with your approved request (${FUTURE_START} to ${FUTURE_END})`,
      ),
    );
    expect(qb.andWhere).toHaveBeenCalledWith('request.status <> :rejected', {
      rejected: 'Rejected',
    });
    expect(requests.save).not.toHaveBeenCalled();
    expect(events.submitted).not.toHaveBeenCalled();
  });

  it('maps a database exclusion violation (a race) to a conflict', async () => {
    const { service, requests, events } = setup();
    requests.save.mockRejectedValue(pgError('23P01'));
    await expect(
      service.create(alice, { startDate: FUTURE_START, endDate: FUTURE_END }),
    ).rejects.toThrow(new ConflictException('Dates overlap with another of your requests'));
    expect(events.submitted).not.toHaveBeenCalled();
  });

  it('lets unknown database errors through untouched', async () => {
    const { service, requests } = setup();
    const boom = pgError('XX000');
    requests.save.mockRejectedValue(boom);
    await expect(
      service.create(alice, { startDate: FUTURE_START, endDate: FUTURE_END }),
    ).rejects.toBe(boom);
  });
});

describe('VacationRequestsService.update', () => {
  it('updates the period, excluding itself from the overlap check, and announces it', async () => {
    const updated = makeRequest({ endDate: '2099-05-09' });
    const { service, requests, events, qb } = setup({ findAfter: updated });

    const result = await service.update('r-1', alice, { endDate: '2099-05-09' });

    expect(qb.andWhere).toHaveBeenCalledWith('request.id <> :excludeId', { excludeId: 'r-1' });
    expect(requests.update).toHaveBeenCalledWith(
      { id: 'r-1', status: VacationStatus.Pending },
      { startDate: FUTURE_START, endDate: '2099-05-09', reason: null, expiredAt: null },
    );
    expect(result).toBe(updated);
    expect(events.updated).toHaveBeenCalledWith(
      expect.objectContaining({ endDate: FUTURE_END }),
      updated,
      expect.anything(),
      expect.anything(),
    );
  });

  it('skips period validation when only the reason changes (the period may have started)', async () => {
    const started = makeRequest({ startDate: '2000-01-01', endDate: '2000-01-05' });
    const { service, requests, qb } = setup({ found: started });

    await service.update('r-1', alice, { reason: ' new ' });

    expect(qb.getOne).not.toHaveBeenCalled();
    // The period is untouched, so the expiry marker must not be reset either.
    expect(requests.update).toHaveBeenCalledWith(expect.anything(), {
      startDate: '2000-01-01',
      endDate: '2000-01-05',
      reason: 'new',
    });
  });

  it('clears the expiry marker only when the period changes, so a re-dated request can expire again', async () => {
    const expired = makeRequest({ expiredAt: new Date('2099-01-01T00:00:00Z') });
    const moved = setup({ found: expired });
    await moved.service.update('r-1', alice, { startDate: '2099-06-01', endDate: '2099-06-05' });
    expect(moved.requests.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ expiredAt: null }),
    );

    const reasonOnly = setup({ found: expired });
    await reasonOnly.service.update('r-1', alice, { reason: 'x' });
    expect(reasonOnly.requests.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.objectContaining({ expiredAt: null }),
    );
  });

  it('keeps the current reason when omitted and clears it when blank', async () => {
    const withReason = makeRequest({ reason: 'keep me' });
    const keep = setup({ found: withReason });
    await keep.service.update('r-1', alice, {});
    expect(keep.requests.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: 'keep me' }),
    );

    const clear = setup({ found: withReason });
    await clear.service.update('r-1', alice, { reason: '   ' });
    expect(clear.requests.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: null }),
    );
  });

  it('validates a changed period', async () => {
    const { service, requests } = setup();
    await expect(service.update('r-1', alice, { endDate: FUTURE_START })).rejects.toThrow(
      'End date must be after start date',
    );
    expect(requests.update).not.toHaveBeenCalled();
  });

  it('rejects an overlapping new period', async () => {
    const { service } = setup({ qb: queryBuilder({ one: makeRequest({ id: 'other' }) }) });
    await expect(service.update('r-1', alice, { endDate: '2099-05-09' })).rejects.toThrow(
      ConflictException,
    );
  });

  it("hides other users' requests as not found", async () => {
    const { service } = setup();
    await expect(service.update('r-1', bob, { reason: 'x' })).rejects.toThrow(NotFoundException);
  });

  it('reports a missing request as not found', async () => {
    const { service } = setup({ found: null });
    await expect(service.update('r-1', alice, { reason: 'x' })).rejects.toThrow(
      new NotFoundException('Vacation request not found'),
    );
  });

  it.each([
    [VacationStatus.Approved, 'Approved requests cannot be modified'],
    [VacationStatus.Rejected, 'Rejected requests cannot be modified; submit a new request instead'],
  ])('refuses to modify a %s request', async (status, message) => {
    const { service, requests } = setup({ found: makeRequest({ status }) });
    await expect(service.update('r-1', alice, { reason: 'x' })).rejects.toThrow(
      new ConflictException(message),
    );
    expect(requests.update).not.toHaveBeenCalled();
  });

  it('conflicts when a concurrent approval wins the guarded update', async () => {
    const { service, requests, events } = setup();
    requests.update.mockResolvedValue({ affected: 0 });
    await expect(service.update('r-1', alice, { reason: 'x' })).rejects.toThrow(
      'Approved requests cannot be modified',
    );
    expect(events.updated).not.toHaveBeenCalled();
  });

  it('maps the database check violation (approved is frozen) to a conflict', async () => {
    const { service, requests } = setup();
    requests.update.mockRejectedValue(pgError('23514'));
    await expect(service.update('r-1', alice, { reason: 'x' })).rejects.toThrow(
      /violates a business rule/,
    );
  });
});

describe('VacationRequestsService.remove', () => {
  it('deletes a pending request guarded on status and announces the cancellation', async () => {
    const { service, requests, events } = setup();
    await service.remove('r-1', alice);
    expect(requests.delete).toHaveBeenCalledWith({ id: 'r-1', status: VacationStatus.Pending });
    expect(events.cancelled).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'r-1' }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("does not let a user cancel someone else's request", async () => {
    const { service, requests } = setup();
    await expect(service.remove('r-1', bob)).rejects.toThrow(NotFoundException);
    expect(requests.delete).not.toHaveBeenCalled();
  });

  it.each([VacationStatus.Approved, VacationStatus.Rejected])(
    'refuses to cancel a %s request',
    async (status) => {
      const { service, requests } = setup({ found: makeRequest({ status }) });
      await expect(service.remove('r-1', alice)).rejects.toThrow(ConflictException);
      expect(requests.delete).not.toHaveBeenCalled();
    },
  );

  it('conflicts when a concurrent approval wins the guarded delete', async () => {
    const { service, requests, events } = setup();
    requests.delete.mockResolvedValue({ affected: 0 });
    await expect(service.remove('r-1', alice)).rejects.toThrow(ConflictException);
    expect(events.cancelled).not.toHaveBeenCalled();
  });
});

describe('VacationRequestsService approve / reject', () => {
  it('approves with a trimmed comment and announces the decision', async () => {
    const decided = makeRequest({ status: VacationStatus.Approved, comments: 'enjoy' });
    const { service, requests, events } = setup({ findAfter: decided });

    const result = await service.approve('r-1', carol, ' enjoy ');

    expect(requests.update).toHaveBeenCalledWith(
      { id: 'r-1', status: VacationStatus.Pending },
      { status: VacationStatus.Approved, comments: 'enjoy' },
    );
    expect(result).toBe(decided);
    expect(events.decided).toHaveBeenCalledWith(
      decided,
      { type: 'user', id: carol.id, role: UserRole.Validator },
      expect.anything(),
    );
  });

  it('approves without a comment, storing null', async () => {
    const { service, requests } = setup();
    await service.approve('r-1', carol);
    expect(requests.update).toHaveBeenCalledWith(expect.anything(), {
      status: VacationStatus.Approved,
      comments: null,
    });
  });

  it('rejects with a comment', async () => {
    const { service, requests } = setup();
    await service.reject('r-1', carol, 'understaffed');
    expect(requests.update).toHaveBeenCalledWith(expect.anything(), {
      status: VacationStatus.Rejected,
      comments: 'understaffed',
    });
  });

  it.each(['', '   '])('refuses to reject with a blank comment (%p)', async (comment) => {
    const { service, requests, events } = setup();
    await expect(service.reject('r-1', carol, comment)).rejects.toThrow(
      new BadRequestException('A comment is required when rejecting a request'),
    );
    expect(requests.update).not.toHaveBeenCalled();
    expect(events.decided).not.toHaveBeenCalled();
  });

  it.each([VacationStatus.Approved, VacationStatus.Rejected])(
    'refuses to decide an already %s request',
    async (status) => {
      const { service, requests } = setup({ found: makeRequest({ status }) });
      await expect(service.approve('r-1', carol)).rejects.toThrow(
        new ConflictException(`Request is already ${status.toLowerCase()}`),
      );
      expect(requests.update).not.toHaveBeenCalled();
    },
  );

  it('conflicts when two validators race and the compare-and-set loses', async () => {
    const { service, requests, events } = setup();
    requests.update.mockResolvedValue({ affected: 0 });
    await expect(service.approve('r-1', carol)).rejects.toThrow(
      new ConflictException('Request was already decided'),
    );
    expect(events.decided).not.toHaveBeenCalled();
  });

  it('reports an unknown request as not found', async () => {
    const { service } = setup({ found: null });
    await expect(service.approve('nope', carol)).rejects.toThrow(NotFoundException);
  });
});

describe('VacationRequestsService.findOne', () => {
  it('returns the owner their own request', async () => {
    const { service } = setup();
    await expect(service.findOne('r-1', alice)).resolves.toMatchObject({ id: 'r-1' });
  });

  it('returns any request to a validator', async () => {
    const { service } = setup();
    await expect(service.findOne('r-1', carol)).resolves.toMatchObject({ id: 'r-1' });
  });

  it("answers 404 (not 403) when a requester asks for someone else's request", async () => {
    const { service } = setup();
    await expect(service.findOne('r-1', bob)).rejects.toThrow(NotFoundException);
  });

  it('answers 404 for a missing request', async () => {
    const { service } = setup({ found: null });
    await expect(service.findOne('r-1', carol)).rejects.toThrow(NotFoundException);
  });
});

describe('VacationRequestsService listing', () => {
  it('lists my requests, scoped to me, with optional status and a pagination meta', async () => {
    const qb = queryBuilder({ many: [makeRequest()], count: 25 });
    const { service } = setup({ qb });

    const page = await service.listMine(alice, {
      page: 2,
      limit: 10,
      status: VacationStatus.Pending,
    });

    expect(qb.where).toHaveBeenCalledWith('request.userId = :userId', { userId: alice.id });
    expect(qb.andWhere).toHaveBeenCalledWith('request.status = :status', { status: 'Pending' });
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(qb.orderBy).toHaveBeenCalledWith('request.createdAt', 'DESC');
    expect(page.meta).toEqual({ page: 2, limit: 10, total: 25, totalPages: 3 });
    expect(page.items).toHaveLength(1);
  });

  it('does not filter by status when none is given', async () => {
    const qb = queryBuilder();
    const { service } = setup({ qb });
    await service.listMine(alice, { page: 1, limit: 10 });
    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('lists all requests for validators with status and user filters', async () => {
    const qb = queryBuilder();
    const { service } = setup({ qb });
    await service.listAll({ page: 1, limit: 5, status: VacationStatus.Approved, userId: 'u-bob' });
    expect(qb.where).toHaveBeenCalledWith('1 = 1');
    expect(qb.andWhere).toHaveBeenCalledWith('request.status = :status', { status: 'Approved' });
    expect(qb.andWhere).toHaveBeenCalledWith('request.userId = :userId', { userId: 'u-bob' });
    expect(qb.skip).toHaveBeenCalledWith(0);
  });
});

describe('VacationRequestsService.teamCalendar', () => {
  const row = (over = {}) => ({
    id: 'r-1',
    startDate: '2030-01-10',
    endDate: '2030-01-12',
    reason: 'secret',
    comments: 'secret',
    user: { id: 'u-bob', name: 'Bob', email: 'bob@example.com' },
    ...over,
  });

  it('returns only approved vacations in the window, exposing no private fields', async () => {
    const qb = queryBuilder({ many: [row()] });
    const { service } = setup({ qb });

    const result = await service.teamCalendar({ from: '2030-01-01', to: '2030-01-31' });

    expect(qb.where).toHaveBeenCalledWith('request.status = :status', { status: 'Approved' });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'request.startDate <= :end AND request.endDate >= :start',
      { start: '2030-01-01', end: '2030-01-31' },
    );
    expect(result).toEqual([
      {
        id: 'r-1',
        startDate: '2030-01-10',
        endDate: '2030-01-12',
        user: { id: 'u-bob', name: 'Bob' },
      },
    ]);
  });

  it('defaults the window to the current month', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2030-02-15T12:00:00Z'));
    try {
      const qb = queryBuilder();
      const { service } = setup({ qb });
      await service.teamCalendar({});
      expect(qb.andWhere).toHaveBeenCalledWith(expect.any(String), {
        start: '2030-02-01',
        end: '2030-02-28',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects a window that ends before it starts', async () => {
    const { service } = setup();
    await expect(service.teamCalendar({ from: '2030-02-01', to: '2030-01-01' })).rejects.toThrow(
      new BadRequestException('"to" must not be before "from"'),
    );
  });

  it('allows a 366-day window but rejects a longer one', async () => {
    const { service } = setup();
    await expect(service.teamCalendar({ from: '2030-01-01', to: '2031-01-02' })).resolves.toEqual(
      [],
    );
    await expect(service.teamCalendar({ from: '2030-01-01', to: '2031-01-03' })).rejects.toThrow(
      'Date window cannot exceed 366 days',
    );
  });
});

describe('VacationRequestsService event recording', () => {
  it('records every event with the manager of the transaction that makes the change', async () => {
    const created = setup();
    await created.service.create(alice, { startDate: FUTURE_START, endDate: FUTURE_END });
    expect(created.transaction).toHaveBeenCalledTimes(1);
    expect(created.events.submitted).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      created.em,
    );

    const updated = setup();
    await updated.service.update('r-1', alice, { reason: 'x' });
    expect(updated.events.updated).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      updated.em,
    );

    const cancelled = setup();
    await cancelled.service.remove('r-1', alice);
    expect(cancelled.events.cancelled).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      cancelled.em,
    );

    const decided = setup();
    await decided.service.approve('r-1', carol);
    expect(decided.events.decided).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      decided.em,
    );
  });

  it('fails the request when its event cannot be recorded, so the transaction rolls back', async () => {
    const { service, events } = setup();
    events.submitted.mockRejectedValue(new Error('outbox insert failed'));
    await expect(
      service.create(alice, { startDate: FUTURE_START, endDate: FUTURE_END }),
    ).rejects.toThrow('outbox insert failed');
  });

  it('records nothing when the change itself is refused', async () => {
    const { service, events, requests } = setup();
    requests.update.mockResolvedValue({ affected: 0 });
    await expect(service.update('r-1', alice, { reason: 'x' })).rejects.toThrow(ConflictException);
    await expect(service.approve('r-1', carol)).rejects.toThrow(ConflictException);
    expect(events.updated).not.toHaveBeenCalled();
    expect(events.decided).not.toHaveBeenCalled();
  });
});
