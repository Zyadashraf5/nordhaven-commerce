import { ApiProperty } from '@nestjs/swagger';
import type { PrincipalRole } from '../../../platform/security/principal';
import type { IssuedSession, SessionView } from '../application/session.service';
import type { MfaChallenge } from '../application/mfa.service';
import type { UserAccountSummary } from '../persistence/user.repository';

export type RoleName = PrincipalRole;

export class UserSummaryResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'email' })
  public email!: string;

  @ApiProperty({ enum: ['CUSTOMER', 'ADMIN'] })
  public role!: RoleName;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;
}

export class SessionCredentialResponse {
  @ApiProperty({
    type: String,
    description: 'Opaque 256-bit session credential. Returned exactly once and never again.',
  })
  public token!: string;

  @ApiProperty({ enum: ['Bearer'] })
  public tokenType!: 'Bearer';

  @ApiProperty({ type: String, format: 'date-time' })
  public expiresAt!: string;
}

export class ChallengeCredentialResponse {
  @ApiProperty({ type: String, description: 'Single-use challenge token for the next step.' })
  public token!: string;

  @ApiProperty({ enum: ['MFA_VERIFICATION', 'MFA_ENROLLMENT'] })
  public purpose!: 'MFA_VERIFICATION' | 'MFA_ENROLLMENT';

  @ApiProperty({ type: String, format: 'date-time' })
  public expiresAt!: string;
}

export class RegistrationResponse {
  @ApiProperty({ type: UserSummaryResponse })
  public user!: UserSummaryResponse;
}

export class SignInResponse {
  @ApiProperty({ enum: ['AUTHENTICATED', 'MFA_REQUIRED', 'MFA_ENROLLMENT_REQUIRED'] })
  public status!: 'AUTHENTICATED' | 'MFA_REQUIRED' | 'MFA_ENROLLMENT_REQUIRED';

  @ApiProperty({ type: SessionCredentialResponse, required: false })
  public session?: SessionCredentialResponse;

  @ApiProperty({ type: ChallengeCredentialResponse, required: false })
  public challenge?: ChallengeCredentialResponse;

  @ApiProperty({ type: UserSummaryResponse, required: false })
  public user?: UserSummaryResponse;
}

export class SessionResponse {
  @ApiProperty({ enum: ['AUTHENTICATED'] })
  public status!: 'AUTHENTICATED';

  @ApiProperty({
    type: String,
    description: 'Opaque 256-bit session credential. Returned exactly once and never again.',
  })
  public token!: string;

  @ApiProperty({ enum: ['Bearer'] })
  public tokenType!: 'Bearer';

  @ApiProperty({ type: String, format: 'date-time' })
  public expiresAt!: string;

  @ApiProperty({ type: UserSummaryResponse })
  public user!: UserSummaryResponse;
}

export class EnrollmentResponse {
  @ApiProperty({ type: String, description: 'Base32 shared secret. Never returned again.' })
  public secret!: string;

  @ApiProperty({ type: String })
  public otpauthUri!: string;

  @ApiProperty({ enum: ['SHA1'] })
  public algorithm!: 'SHA1';

  @ApiProperty({ enum: [6] })
  public digits!: number;

  @ApiProperty({ enum: [30] })
  public period!: number;

  @ApiProperty({ type: String })
  public issuer!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public expiresAt!: string;
}

export class EnrollmentConfirmationResponse {
  @ApiProperty({ enum: ['MFA_ENROLLED'] })
  public status!: 'MFA_ENROLLED';

  @ApiProperty({ type: [String], description: 'Single-use recovery codes. Returned exactly once.' })
  public recoveryCodes!: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  public confirmedAt!: string;
}

export class SessionSummaryResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public lastUsedAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public expiresAt!: string;

  @ApiProperty({ type: String, nullable: true })
  public clientLabel!: string | null;

  @ApiProperty({ type: Boolean })
  public current!: boolean;
}

export class PrincipalResponse {
  @ApiProperty({ type: UserSummaryResponse })
  public user!: UserSummaryResponse;

  @ApiProperty({ enum: ['CUSTOMER', 'ADMIN'] })
  public role!: RoleName;

  @ApiProperty({ type: SessionSummaryResponse })
  public session!: SessionSummaryResponse;
}

export class SessionsResponse {
  @ApiProperty({ type: [SessionSummaryResponse] })
  public sessions!: SessionSummaryResponse[];
}

export class ResetAcceptedResponse {
  @ApiProperty({ enum: ['ACCEPTED'] })
  public status!: 'ACCEPTED';
}

export class AccountsResponse {
  @ApiProperty({ type: [UserSummaryResponse] })
  public users!: UserSummaryResponse[];

  @ApiProperty({ type: String, nullable: true })
  public nextCursor!: string | null;
}

export function toUserSummary(user: UserAccountSummary): UserSummaryResponse {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toSessionCredential(session: IssuedSession): SessionCredentialResponse {
  return { token: session.token, tokenType: 'Bearer', expiresAt: session.expiresAt.toISOString() };
}

export function toChallenge(challenge: MfaChallenge): ChallengeCredentialResponse {
  return {
    token: challenge.token,
    purpose: challenge.purpose,
    expiresAt: challenge.expiresAt.toISOString(),
  };
}

export function toSessionSummary(view: SessionView): SessionSummaryResponse {
  return {
    id: view.id,
    createdAt: view.createdAt.toISOString(),
    lastUsedAt: view.lastUsedAt.toISOString(),
    expiresAt: view.expiresAt.toISOString(),
    clientLabel: view.clientLabel,
    current: view.current,
  };
}
