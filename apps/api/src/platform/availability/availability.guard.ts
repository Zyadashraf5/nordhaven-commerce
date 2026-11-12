import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_ROUTE } from '../security/access.decorators';
import { ApplicationAvailabilityService } from './application-availability.service';

/**
 * Fails business requests closed while the instance is not ready.
 *
 * Health probes stay public so that liveness and readiness keep reporting their own state. Any other
 * route is rejected with `503 SERVICE_UNAVAILABLE`, which is evaluated before authentication so an
 * outage is never reported as an authentication failure.
 */
@Injectable()
export class AvailabilityGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly availability: ApplicationAvailabilityService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;
    if (this.availability.isReady()) return true;
    throw new ServiceUnavailableException();
  }
}
