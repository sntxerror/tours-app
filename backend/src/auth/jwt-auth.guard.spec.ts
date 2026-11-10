import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

function setup({ isPublic = false, verify }: { isPublic?: boolean; verify?: jest.Mock } = {}) {
  const jwt = {
    verifyAsync: verify ?? jest.fn().mockResolvedValue({ sub: 'u-1', role: 'Requester' }),
  };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(isPublic) };
  const guard = new JwtAuthGuard(jwt as unknown as JwtService, reflector as unknown as Reflector);
  const run = (authorization?: string) => {
    const request: Record<string, unknown> = { headers: { authorization } };
    const context = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { request, result: guard.canActivate(context) };
  };
  return { jwt, run };
}

describe('JwtAuthGuard', () => {
  it('lets public routes through without looking at the token', async () => {
    const { jwt, run } = setup({ isPublic: true });
    await expect(run().result).resolves.toBe(true);
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
  });

  it('attaches the user from a valid bearer token', async () => {
    const { run } = setup();
    const { request, result } = run('Bearer good');
    await expect(result).resolves.toBe(true);
    expect(request.user).toEqual({ id: 'u-1', role: 'Requester' });
  });

  it.each([undefined, '', 'Bearer', 'Bearer ', 'Basic abc', 'bearer abc', 'abc'])(
    'rejects a missing or malformed header (%p)',
    async (header) => {
      const { jwt, run } = setup();
      await expect(run(header).result).rejects.toThrow(
        new UnauthorizedException('Missing bearer token'),
      );
      expect(jwt.verifyAsync).not.toHaveBeenCalled();
    },
  );

  it('rejects an invalid or expired token', async () => {
    const { run } = setup({ verify: jest.fn().mockRejectedValue(new Error('jwt expired')) });
    await expect(run('Bearer stale').result).rejects.toThrow(
      new UnauthorizedException('Invalid or expired token'),
    );
  });
});
