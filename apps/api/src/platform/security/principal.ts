/**
 * Shared authorization vocabulary and the authenticated-principal contract.
 *
 * This file belongs to the platform layer, not to a feature module, so that any module (including
 * Health) can mark routes and read the principal without importing another feature module.
 */

export type PrincipalRole = 'CUSTOMER' | 'ADMIN';

export const PRINCIPAL_ROLES: readonly PrincipalRole[] = ['CUSTOMER', 'ADMIN'];

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly role: PrincipalRole;
  readonly sessionId: string;
  readonly sessionExpiresAt: Date;
}

export interface SessionAuthenticationContext {
  readonly correlationId: string;
}

/**
 * Implemented by the Identity module. Returns `null` when the credential is missing, unknown,
 * expired, or revoked; the guard then answers `401 UNAUTHENTICATED`.
 */
export interface SessionAuthenticator {
  authenticate(
    credential: string,
    context: SessionAuthenticationContext,
  ): Promise<AuthenticatedPrincipal | null>;
}

export const SESSION_AUTHENTICATOR = Symbol('SESSION_AUTHENTICATOR');

const principals = new WeakMap<object, AuthenticatedPrincipal>();

export function setAuthenticatedPrincipal(
  request: object,
  principal: AuthenticatedPrincipal,
): void {
  principals.set(request, principal);
}

export function getAuthenticatedPrincipal(request: object): AuthenticatedPrincipal | undefined {
  return principals.get(request);
}

const BEARER_PATTERN = /^Bearer[ ]+([A-Za-z0-9_-]{16,512})$/i;

/** Extracts a base64url session credential from an `Authorization` header value. */
export function extractBearerCredential(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  return BEARER_PATTERN.exec(header)?.[1];
}
