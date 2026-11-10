import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import type { UserRole } from './user-role.enum';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  /** Includes the password hash; only for credential checks. Email match is case-insensitive. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('lower(user.email) = lower(:email)', { email })
      .getOne();
  }

  list(role?: UserRole): Promise<User[]> {
    return this.users.find({ where: role ? { role } : {}, order: { name: 'ASC' } });
  }
}
