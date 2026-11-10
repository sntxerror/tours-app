import { BadRequestException } from '@nestjs/common';

export const todayIso = (now: Date = new Date()): string => now.toISOString().slice(0, 10);

/**
 * Date rules for a vacation period (business rules 1 and 4).
 * The end date must be strictly after the start date, so single-day requests are rejected
 * (mirrors the schema's `end_date > start_date` check).
 */
export function assertValidPeriod(startDate: string, endDate: string, today = todayIso()): void {
  if (endDate <= startDate) {
    throw new BadRequestException('End date must be after start date');
  }
  if (startDate < today) {
    throw new BadRequestException('Vacation requests in the past are not allowed');
  }
}
