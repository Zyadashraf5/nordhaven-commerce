import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import {
  getAuthenticatedPrincipal,
  type AuthenticatedPrincipal,
  type PrincipalRole,
} from './principal';

export const IS_PUBLIC_ROUTE = 'nordhaven:isPublicRoute';
export const REQUIRED_ROLES = 'nordhaven:requiredRoles';

/**
 * Marks a route (or every route of a controller) as reachable without authentication.
 *
 * Routes are protected by default; only `@Public()` opts out. Forgetting a decorator therefore
 * fails closed.
 */
export function Public(): MethodDecorator & ClassDecorator {
  return SetMetadata(IS_PUBLIC_ROUTE, true);
}

/** Restricts a route (or controller) to the listed roles. */
export function Roles(...roles: readonly PrincipalRole[]): MethodDecorator & ClassDecorator {
  return SetMetadata(REQUIRED_ROLES, roles);
}

/** Injects the authenticated principal resolved by the global session guard. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedPrincipal => {
    const request = context.switchToHttp().getRequest<object>();
    const principal = getAuthenticatedPrincipal(request);
    if (principal === undefined) {
      throw new Error('No authenticated principal is attached to the request');
    }
    return principal;
  },
);
