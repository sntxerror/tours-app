import 'reflect-metadata';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from '../users/user-role.enum';
import { AuditController } from './audit.controller';
import type { AuditService } from './audit.service';
import type { ListAuditLogQueryDto } from './dto/list-audit-log-query.dto';

describe('AuditController', () => {
  it('is restricted to validators', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AuditController)).toEqual([UserRole.Validator]);
  });

  it('lists the audit log through the service with the query as given', async () => {
    const page = { items: [], meta: { page: 2, limit: 5, total: 0, totalPages: 0 } };
    const list = jest.fn().mockResolvedValue(page);
    const controller = new AuditController({ list } as unknown as AuditService);
    const query = { page: 2, limit: 5, type: 'travel.auth.login-failed' } as ListAuditLogQueryDto;

    await expect(controller.list(query)).resolves.toBe(page);
    expect(list).toHaveBeenCalledWith(query);
  });
});
