import { isCalendarDate } from './is-calendar-date.validator';

describe('isCalendarDate', () => {
  it.each(['2030-01-01', '2028-02-29', '2030-12-31'])('accepts %s', (value) => {
    expect(isCalendarDate(value)).toBe(true);
  });

  it.each([
    '2030-02-30',
    '2029-02-29', // not a leap year
    '2030-13-01',
    '2030-00-10',
    '2030-1-1',
    '30-01-01',
    '2030-01-01T00:00:00Z',
    ' 2030-01-01',
    '',
  ])('rejects %p', (value) => {
    expect(isCalendarDate(value)).toBe(false);
  });

  it.each([null, undefined, 20300101, new Date('2030-01-01'), {}])(
    'rejects non-string %p',
    (value) => {
      expect(isCalendarDate(value)).toBe(false);
    },
  );
});
