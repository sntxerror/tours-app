import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UsersService } from './users.service';
import { UserRole } from './user-role.enum';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles(UserRole.Validator)
  list(@Query() { role }: ListUsersQueryDto) {
    return this.users.list(role);
  }
}
