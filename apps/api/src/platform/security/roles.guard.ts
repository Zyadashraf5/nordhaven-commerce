import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError } from '../http/app-error';
import { getCorrelationId } from '../observability/correlation';
import { REQUIRED_ROLES } from './access.decorators';
import { AUTHORIZATION_AUDIT_PORT, type AuthorizationAuditPort } from './authorization-audit.port';
import { getAuthenticatedPrincipal, type PrincipalRole } from './principal';

/**
 * Enforces `@Roles(...)` against the authenticated principal and records the decision.
 *
 * Role information is always taken from the server-resolved principal; a client-supplied role is
 * never consulted. The audit port is optional so the platform layer stays usable without the
 * Identity module, but when it is present every grant and denial is persisted.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    @Optional()
    @Inject(AUTHORIZATION_AUDIT_PORT)
    private readonly audit?: AuthorizationAuditPort,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<readonly PrincipalRole[] | undefined>(
      REQUIRED_ROLES,
      [context.getHandler(), context.getClass()],
    );
    if (required === undefined || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const principal = getAuthenticatedPrincipal(request);
    if (principal === undefined) throw AppError.unauthenticated();

    const granted = required.includes(principal.role);
    if (this.audit !== undefined) {
      await this.audit.record({
        correlationId: getCorrelationId(request),
        outcome: granted ? 'GRANTED' : 'DENIED',
        permission: `roles:${[...required].sort().join('|')}`,
        principal,
      });
    }

    if (!granted) throw AppError.forbidden();
    return true;
  }
}
