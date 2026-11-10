import { IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.validator';

export class TeamVacationsQueryDto {
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @IsOptional()
  @IsCalendarDate()
  to?: string;
}
