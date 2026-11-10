import { IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '../user-role.enum';

export class ListUsersQueryDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
