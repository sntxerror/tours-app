import type { Request, Response } from 'express';
import { RequestContextMiddleware } from './request-context.middleware';
import { getRequestContext } from './request-context';

function run(headerValue?: string) {
  const setHeader = jest.fn();
  let seen: ReturnType<typeof getRequestContext>;
  new RequestContextMiddleware().use(
    { header: () => headerValue, ip: '10.0.0.7' } as unknown as Request,
    { setHeader } as unknown as Response,
    () => {
      seen = getRequestContext();
    },
  );
  return { setHeader, seen };
}

describe('RequestContextMiddleware', () => {
  it('generates a correlation id, echoes it and exposes it with the client ip', () => {
    const { setHeader, seen } = run();
    expect(seen?.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(seen?.ip).toBe('10.0.0.7');
    expect(setHeader).toHaveBeenCalledWith('x-request-id', seen?.correlationId);
  });

  it('reuses a valid caller-supplied X-Request-Id', () => {
    expect(run('trace-abc.123').seen?.correlationId).toBe('trace-abc.123');
  });

  it.each(['has spaces', 'x'.repeat(129), '<script>'])('replaces an unsafe id (%s)', (bad) => {
    expect(run(bad).seen?.correlationId).not.toBe(bad);
  });

  it('has no context outside a request', () => {
    expect(getRequestContext()).toBeUndefined();
  });
});
