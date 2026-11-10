import 'reflect-metadata';
import { NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { ConfigService } from '@nestjs/config';
import { TestEndpointsGuard } from './test-endpoints.guard';
import { TestController } from './test.controller';

const guardWith = (value: unknown) =>
  new TestEndpointsGuard({ get: () => value } as unknown as ConfigService);

describe('TestEndpointsGuard', () => {
  it.each(['true', 'TRUE', 'True', true])('lets requests through when enabled (%p)', (value) => {
    expect(guardWith(value).canActivate()).toBe(true);
  });

  it.each([undefined, '', 'false', 'FALSE', '1', 'yes', false, ' true'])(
    'answers 404 when not enabled (%p)',
    (value) => {
      expect(() => guardWith(value).canActivate()).toThrow(NotFoundException);
    },
  );

  it('guards the test controller', () => {
    expect(GUARDS_METADATA).toBe('__guards__');
    expect(Reflect.getMetadata(GUARDS_METADATA, TestController)).toContain(TestEndpointsGuard);
  });
});
