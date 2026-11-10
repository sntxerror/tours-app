import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.validator';

export class CreateVacationRequestDto {
  @IsCalendarDate()
  startDate: string;

  @IsCalendarDate()
  endDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
