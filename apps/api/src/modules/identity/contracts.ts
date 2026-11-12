import type { PrincipalRole } from '../../platform/security/principal';

/**
 * The Identity and Access capability's published contract.
 *
 * The Identity capability owns the account, the credential, the session, the administrator's
 * multi-factor authentication, and the security event trail. The administrative surface reads them
 * through this contract, so it never reaches into the Identity capability's tables.
 */

/** One account, as the administrative surface reads it. */
export interface AccountSummary {
  readonly id: string;
  readonly email: string;
  readonly role: PrincipalRole;
  readonly createdAt: Date;
}

/** One recorded security event. */
export interface SecurityEventSummary {
  readonly id: string;
  readonly eventType: string;
  readonly outcome: string;
  readonly actorUserId: string | null;
  readonly actorRole: PrincipalRole | null;
  readonly correlationId: string;
  readonly createdAt: Date;
}

/**
 * The Identity capability's administrative contract.
 *
 * The account list and the security trail are the platform's audit evidence, so they have one owner
 * and one reader.
 */
export interface IdentityAudit {
  countAccounts(): Promise<number>;
  accountIdsAfter(cursor: string | null, limit: number): Promise<readonly string[]>;
  accountsForIds(ids: readonly string[]): Promise<readonly AccountSummary[]>;
  /** Every account, newest first. */
  listAccounts(limit: number): Promise<readonly AccountSummary[]>;
  /** The most recent security events, newest first. */
  recentSecurityEvents(limit: number): Promise<readonly SecurityEventSummary[]>;
}

/** The injection token the Identity capability publishes its audit contract under. */
export const IDENTITY_AUDIT = Symbol('IDENTITY_AUDIT');
