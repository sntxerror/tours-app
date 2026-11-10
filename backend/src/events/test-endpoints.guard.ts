import { type CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * The /api/test/* endpoints are unauthenticated and expose event payloads (user ids, attempted login
 * emails, client IPs), so they exist only when `ENABLE_TEST_ENDPOINTS=true`. Otherwise they answer
 * 404, as if they were not there.
 */
@Injectable()
export class TestEndpointsGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (String(this.config.get('ENABLE_TEST_ENDPOINTS')).toLowerCase() !== 'true') {
      throw new NotFoundException();
    }
    return true;
  }
}
