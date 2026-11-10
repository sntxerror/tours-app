import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { ALL_EVENT_TYPES, type EventType } from '../../events/event-types';

/** `GET /audit-log` filters; all optional and combinable. */
export class ListAuditLogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ALL_EVENT_TYPES)
  type?: EventType;

  /** Everything caused by one request (the `X-Request-Id` it carried). */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  @Matches(/^[\w.-]+$/)
  correlationId?: string;

  /** The trail of one vacation request. */
  @IsOptional()
  @IsUUID()
  requestId?: string;
}
