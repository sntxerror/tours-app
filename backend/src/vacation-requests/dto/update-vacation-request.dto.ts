import { IsOptional, IsString, MaxLength } from 'class-validator';
import { IsCalendarDate } from '../../common/validators/is-calendar-date.validator';

export class UpdateVacationRequestDto {
  @IsOptional()
  @IsCalendarDate()
  startDate?: string;

  @IsOptional()
  @IsCalendarDate()
  endDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
