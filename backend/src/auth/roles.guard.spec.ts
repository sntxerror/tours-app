import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { UserRole } from '../users/user-role.enum';
import { RolesGuard } from './roles.guard';

function run(required: UserRole[] | undefined, user?: { id: string; role: UserRole }) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(required) };
  const guard = new RolesGuard(reflector as unknown as Reflector);
  const context = {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  return () => guard.canActivate(context);
}

describe('RolesGuard', () => {
  const requester = { id: 'u-1', role: UserRole.Requester };
  const validator = { id: 'u-2', role: UserRole.Validator };

  it('allows any user when no roles are required', () => {
    expect(run(undefined, requester)()).toBe(true);
  });

  it('treats an empty role list as unrestricted', () => {
    expect(run([], requester)()).toBe(true);
  });

  it('allows a user holding a required role', () => {
    expect(run([UserRole.Validator], validator)()).toBe(true);
  });

  it('allows any of several roles', () => {
    expect(run([UserRole.Requester, UserRole.Validator], requester)()).toBe(true);
  });

  it('forbids a user without the required role', () => {
    expect(run([UserRole.Validator], requester)).toThrow(ForbiddenException);
  });

  it('forbids when there is no user on the request', () => {
    expect(run([UserRole.Validator])).toThrow(ForbiddenException);
  });
});
