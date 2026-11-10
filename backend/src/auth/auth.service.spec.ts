import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import type { User } from '../users/user.entity';
import type { UsersService } from '../users/users.service';
import type { AuthEventsPublisher } from './auth-events.publisher';
import { AuthService } from './auth.service';

const PASSWORD = 'Password123!';
const hash = bcrypt.hashSync(PASSWORD, 4);
const alice = { id: 'u-1', email: 'alice@example.com', role: 'Requester', password: hash } as User;

function setup(found: User | null) {
  const users = {
    findByEmailWithPassword: jest.fn().mockResolvedValue(found),
    findById: jest.fn().mockResolvedValue(found && { ...found, password: undefined }),
  };
  const events = {
    loginSucceeded: jest.fn().mockResolvedValue(undefined),
    loginFailed: jest.fn().mockResolvedValue(undefined),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('token') };
  const service = new AuthService(
    users as unknown as UsersService,
    jwt as unknown as JwtService,
    events as unknown as AuthEventsPublisher,
  );
  return { service, events };
}

describe('AuthService login events', () => {
  it('announces a successful login and returns a token', async () => {
    const { service, events } = setup(alice);
    const result = await service.login({ email: alice.email, password: PASSWORD });

    expect(result.accessToken).toBe('token');
    expect(events.loginSucceeded).toHaveBeenCalledWith(expect.objectContaining({ id: 'u-1' }));
    expect(events.loginFailed).not.toHaveBeenCalled();
  });

  it('announces a wrong password without leaking which check failed to the caller', async () => {
    const { service, events } = setup(alice);
    await expect(service.login({ email: alice.email, password: 'nope' })).rejects.toThrow(
      new UnauthorizedException('Invalid email or password'),
    );
    expect(events.loginFailed).toHaveBeenCalledWith(alice.email, 'wrong-password');
    expect(events.loginSucceeded).not.toHaveBeenCalled();
  });

  it('announces an unknown email with the same caller-facing error', async () => {
    const { service, events } = setup(null);
    await expect(service.login({ email: 'ghost@example.com', password: PASSWORD })).rejects.toThrow(
      new UnauthorizedException('Invalid email or password'),
    );
    expect(events.loginFailed).toHaveBeenCalledWith('ghost@example.com', 'unknown-email');
  });
});
