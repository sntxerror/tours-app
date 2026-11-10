import 'reflect-metadata';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVacationRequestDto } from './create-vacation-request.dto';
import { ApproveVacationRequestDto, RejectVacationRequestDto } from './decision.dto';
import { ListVacationRequestsQueryDto } from './list-vacation-requests-query.dto';
import { TeamVacationsQueryDto } from './team-vacations-query.dto';
import { UpdateVacationRequestDto } from './update-vacation-request.dto';

async function errorsFor<T extends object>(cls: ClassConstructor<T>, plain: object) {
  const dto = plainToInstance(cls, plain);
  return { dto, errors: (await validate(dto)).map((e) => e.property) };
}

describe('CreateVacationRequestDto', () => {
  it('accepts valid dates with an optional reason', async () => {
    expect(
      (
        await errorsFor(CreateVacationRequestDto, {
          startDate: '2030-01-01',
          endDate: '2030-01-05',
        })
      ).errors,
    ).toEqual([]);
    expect(
      (
        await errorsFor(CreateVacationRequestDto, {
          startDate: '2030-01-01',
          endDate: '2030-01-05',
          reason: 'trip',
        })
      ).errors,
    ).toEqual([]);
  });

  it('requires both dates and rejects impossible ones', async () => {
    expect((await errorsFor(CreateVacationRequestDto, {})).errors).toEqual([
      'startDate',
      'endDate',
    ]);
    expect(
      (
        await errorsFor(CreateVacationRequestDto, {
          startDate: '2030-02-30',
          endDate: '2030-03-01',
        })
      ).errors,
    ).toEqual(['startDate']);
  });

  it('rejects a reason over 1000 characters or a non-string reason', async () => {
    const base = { startDate: '2030-01-01', endDate: '2030-01-05' };
    expect(
      (await errorsFor(CreateVacationRequestDto, { ...base, reason: 'x'.repeat(1001) })).errors,
    ).toEqual(['reason']);
    expect((await errorsFor(CreateVacationRequestDto, { ...base, reason: 5 })).errors).toEqual([
      'reason',
    ]);
    expect(
      (await errorsFor(CreateVacationRequestDto, { ...base, reason: 'x'.repeat(1000) })).errors,
    ).toEqual([]);
  });
});

describe('UpdateVacationRequestDto', () => {
  it('accepts an empty body (all fields optional)', async () => {
    expect((await errorsFor(UpdateVacationRequestDto, {})).errors).toEqual([]);
  });

  it('validates the fields that are present', async () => {
    expect((await errorsFor(UpdateVacationRequestDto, { endDate: 'tomorrow' })).errors).toEqual([
      'endDate',
    ]);
    expect(
      (await errorsFor(UpdateVacationRequestDto, { reason: 'x'.repeat(1001) })).errors,
    ).toEqual(['reason']);
  });
});

describe('decision DTOs', () => {
  it('trims the rejection comment', async () => {
    const { dto, errors } = await errorsFor(RejectVacationRequestDto, {
      comment: '  no capacity  ',
    });
    expect(errors).toEqual([]);
    expect(dto.comment).toBe('no capacity');
  });

  it.each([{}, { comment: '' }, { comment: '   ' }, { comment: 5 }])(
    'requires a non-blank rejection comment (%p)',
    async (body) => {
      expect((await errorsFor(RejectVacationRequestDto, body)).errors).toEqual(['comment']);
    },
  );

  it('rejects an overlong rejection comment', async () => {
    expect(
      (await errorsFor(RejectVacationRequestDto, { comment: 'x'.repeat(1001) })).errors,
    ).toEqual(['comment']);
  });

  it('treats the approval comment as optional and trims it', async () => {
    expect((await errorsFor(ApproveVacationRequestDto, {})).errors).toEqual([]);
    expect((await errorsFor(ApproveVacationRequestDto, { comment: ' ok ' })).dto.comment).toBe(
      'ok',
    );
  });
});

describe('list/team query DTOs', () => {
  it('accepts a known status and a uuid user id', async () => {
    const { errors } = await errorsFor(ListVacationRequestsQueryDto, {
      status: 'Pending',
      userId: '3f2b8a54-1d5e-4a0c-9d57-6a1f6b9a2c10',
      page: '2',
    });
    expect(errors).toEqual([]);
  });

  it('rejects an unknown status and a malformed user id', async () => {
    const { errors } = await errorsFor(ListVacationRequestsQueryDto, {
      status: 'Done',
      userId: '123',
    });
    expect(errors.sort()).toEqual(['status', 'userId']);
  });

  it('validates the team calendar window dates', async () => {
    expect((await errorsFor(TeamVacationsQueryDto, {})).errors).toEqual([]);
    expect(
      (await errorsFor(TeamVacationsQueryDto, { from: '2030-01-01', to: '2030-01-31' })).errors,
    ).toEqual([]);
    expect(
      (await errorsFor(TeamVacationsQueryDto, { from: 'x', to: '2030-13-01' })).errors,
    ).toEqual(['from', 'to']);
  });
});
