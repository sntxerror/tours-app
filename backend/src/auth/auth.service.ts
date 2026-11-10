import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import type { JwtPayload } from './auth.types';
import type { LoginDto } from './dto/login.dto';

// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login({ email, password }: LoginDto): Promise<{ accessToken: string; user: User }> {
    const found = await this.users.findByEmailWithPassword(email);
    const valid = await bcrypt.compare(password, found?.password ?? DUMMY_HASH);
    if (!found || !valid) throw new UnauthorizedException('Invalid email or password');

    const payload: JwtPayload = { sub: found.id, role: found.role };
    // Re-read without the hash so it can never leak into the response.
    const user = await this.profile(found.id);
    return { accessToken: await this.jwt.signAsync(payload), user };
  }

  async profile(userId: string): Promise<User> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('User no longer exists');
    return user;
  }
}
