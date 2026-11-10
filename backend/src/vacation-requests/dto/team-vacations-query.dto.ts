import { IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.validator';

/** Date window for the team calendar; defaults to the current month. */
export class TeamVacationsQueryDto {
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @IsOptional()
  @IsCalendarDate()
  to?: string;
}
