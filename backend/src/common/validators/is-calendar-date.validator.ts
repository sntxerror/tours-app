import { registerDecorator, type ValidationOptions } from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written as `YYYY-MM-DD` (rejects `2026-02-30`). */
export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) =>
    registerDecorator({
      name: 'isCalendarDate',
      target: target.constructor,
      propertyName: propertyKey as string,
      options: {
        message: ({ property }) => `${property} must be a valid date in YYYY-MM-DD format`,
        ...options,
      },
      validator: { validate: isCalendarDate },
    });
}
