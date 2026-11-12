import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError } from '../http/app-error';
import { getCorrelationId } from '../observability/correlation';
import { IS_PUBLIC_ROUTE } from './access.decorators';
import {
  extractBearerCredential,
  setAuthenticatedPrincipal,
  SESSION_AUTHENTICATOR,
  type SessionAuthenticator,
} from './principal';

/**
 * Authenticates every non-public request from the bearer session credential.
 *
 * Protected by default: a route is only anonymous when it is explicitly marked `@Public()`.
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    @Inject(SESSION_AUTHENTICATOR) private readonly authenticator: SessionAuthenticator,
  ) {}

  public async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_ROUTE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const credential = extractBearerCredential(request.headers.authorization);
    if (credential === undefined) throw AppError.unauthenticated();

    const principal = await this.authenticator.authenticate(credential, {
      correlationId: getCorrelationId(request),
    });
    if (principal === null) throw AppError.unauthenticated();

    setAuthenticatedPrincipal(request, principal);
    return true;
  }
}
