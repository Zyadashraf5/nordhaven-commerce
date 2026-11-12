/**
 * Identity shapes from openapi/openapi.json (Nordhaven Commerce Backend API
 * 1.3.0): UserSummaryResponse, SessionSummaryResponse, PrincipalResponse,
 * SignInResponse, ChallengeCredentialResponse, EnrollmentResponse,
 * EnrollmentConfirmationResponse, RegistrationResponse.
 */

export type Role = 'CUSTOMER' | 'ADMIN';

export interface UserSummary {
  id: string;
  email: string;
  role: Role;
  createdAt: string;
}

export interface SessionSummary {
  id: string;
  clientLabel: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface Principal {
  role: Role;
  session: SessionSummary;
  user: UserSummary;
}

export interface ChallengeCredential {
  token: string;
  purpose: 'MFA_VERIFICATION' | 'MFA_ENROLLMENT';
  expiresAt: string;
}

/** What /api/session/sign-in returns (the session token stays in a cookie). */
export interface SignInResult {
  status: 'AUTHENTICATED' | 'MFA_REQUIRED' | 'MFA_ENROLLMENT_REQUIRED';
  user?: UserSummary;
  challenge?: ChallengeCredential;
}

export interface MfaEnrollment {
  algorithm: 'SHA1';
  digits: 6;
  period: 30;
  issuer: string;
  secret: string;
  otpauthUri: string;
  expiresAt: string;
}

export interface MfaEnrollmentConfirmation {
  status: 'MFA_ENROLLED';
  confirmedAt: string;
  recoveryCodes: string[];
}

export interface Registration {
  user: UserSummary;
}

export type SessionState =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; principal: Principal }
  | { status: 'unavailable'; message: string };
