import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { VacationStatus } from '../vacation-status.enum';

/** Requester view (`GET /vacation-requests/me`). */
export class ListMyVacationRequestsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(VacationStatus)
  status?: VacationStatus;
}

/** Validator dashboard (`GET /vacation-requests`). */
export class ListVacationRequestsQueryDto extends ListMyVacationRequestsQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;
}
