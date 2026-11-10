import { BadRequestException } from '@nestjs/common';
import { assertValidPeriod, todayIso } from './vacation-rules';

const TODAY = '2030-06-15';

describe('assertValidPeriod', () => {
  it('accepts a period that starts today and ends later', () => {
    expect(() => assertValidPeriod('2030-06-15', '2030-06-16', TODAY)).not.toThrow();
  });

  it('accepts a multi-day period in the future', () => {
    expect(() => assertValidPeriod('2030-07-01', '2030-07-14', TODAY)).not.toThrow();
  });

  it('rejects a single-day period (end must be strictly after start)', () => {
    expect(() => assertValidPeriod('2030-07-01', '2030-07-01', TODAY)).toThrow(
      new BadRequestException('End date must be after start date'),
    );
  });

  it('rejects an end date before the start date', () => {
    expect(() => assertValidPeriod('2030-07-10', '2030-07-01', TODAY)).toThrow(
      'End date must be after start date',
    );
  });

  it('rejects a period starting in the past', () => {
    expect(() => assertValidPeriod('2030-06-14', '2030-06-20', TODAY)).toThrow(
      new BadRequestException('Vacation requests in the past are not allowed'),
    );
  });
});

describe('todayIso', () => {
  it('formats the UTC date as YYYY-MM-DD', () => {
    expect(todayIso(new Date('2030-06-15T23:59:59Z'))).toBe('2030-06-15');
  });
});
