import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { VacationStatus } from '../vacation-status.enum';

export class ListMyVacationRequestsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(VacationStatus)
  status?: VacationStatus;
}

export class ListVacationRequestsQueryDto extends ListMyVacationRequestsQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;
}
