import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { AuditService } from './audit.service';
import { ListAuditLogQueryDto } from './dto/list-audit-log-query.dto';

@Controller('audit-log')
@Roles(UserRole.Validator)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  /** Paginated, newest first. Contains actors, client IPs and attempted login emails: validators only. */
  @Get()
  list(@Query() query: ListAuditLogQueryDto) {
    return this.audit.list(query);
  }
}
