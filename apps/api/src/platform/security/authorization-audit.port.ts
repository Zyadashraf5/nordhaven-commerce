import type { AuthenticatedPrincipal } from './principal';

export type AuthorizationAuditOutcome = 'GRANTED' | 'DENIED';

export interface AuthorizationAuditInput {
  readonly correlationId: string;
  readonly outcome: AuthorizationAuditOutcome;
  /** Stable name of the capability that was evaluated, for example `roles:ADMIN`. */
  readonly permission: string;
  readonly principal?: AuthenticatedPrincipal;
}

/**
 * Durable audit boundary for authorization decisions.
 *
 * The platform guard owns the decision, so it also owns the record; the Identity module provides the
 * implementation that persists the event.
 */
export interface AuthorizationAuditPort {
  record(input: AuthorizationAuditInput): Promise<void>;
}

export const AUTHORIZATION_AUDIT_PORT = Symbol('AUTHORIZATION_AUDIT_PORT');
