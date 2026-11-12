import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../crypto/password-hasher';

/**
 * Boundary schemas.
 *
 * Every object is strict, so an unexpected field is rejected instead of ignored. The password rules
 * are duplicated in the application layer on purpose: the boundary gives a fast `400`, and the
 * service re-checks against the stored address during reset and change flows.
 */
const emailValue = z.email().max(254);
const passwordValue = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);
const tokenValue = z.string().min(16).max(512);
const totpCodeValue = z.string().regex(/^[0-9]{6}$/);
const recoveryCodeValue = z.string().min(8).max(40);

export class RegisterRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    email: emailValue,
    password: passwordValue,
  });

  @ApiProperty({ type: String, format: 'email', maxLength: 254 })
  public email!: string;

  @ApiProperty({
    type: String,
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  public password!: string;
}

export class SignInRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    email: emailValue,
    password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  });

  @ApiProperty({ type: String, format: 'email', maxLength: 254 })
  public email!: string;

  @ApiProperty({ type: String, format: 'password', maxLength: PASSWORD_MAX_LENGTH })
  public password!: string;
}

export class MfaChallengeRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    challengeToken: tokenValue,
  });

  @ApiProperty({ type: String, maxLength: 512 })
  public challengeToken!: string;
}

export class MfaVerificationRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z
    .strictObject({
      challengeToken: tokenValue,
      code: totpCodeValue.optional(),
      recoveryCode: recoveryCodeValue.optional(),
    })
    .refine((value) => (value.code === undefined) !== (value.recoveryCode === undefined), {
      message: 'Provide exactly one of code or recoveryCode',
      path: ['code'],
    });

  @ApiProperty({ type: String, maxLength: 512 })
  public challengeToken!: string;

  @ApiProperty({ type: String, required: false, pattern: '^[0-9]{6}$' })
  public code?: string;

  @ApiProperty({ type: String, required: false, maxLength: 40 })
  public recoveryCode?: string;
}

export class EnrollmentConfirmationRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    challengeToken: tokenValue,
    code: totpCodeValue,
  });

  @ApiProperty({ type: String, maxLength: 512 })
  public challengeToken!: string;

  @ApiProperty({ type: String, pattern: '^[0-9]{6}$' })
  public code!: string;
}

export class ChangePasswordRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    newPassword: passwordValue,
  });

  @ApiProperty({ type: String, format: 'password', maxLength: PASSWORD_MAX_LENGTH })
  public currentPassword!: string;

  @ApiProperty({
    type: String,
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  public newPassword!: string;
}

export class ResetRequestRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ email: emailValue });

  @ApiProperty({ type: String, format: 'email', maxLength: 254 })
  public email!: string;
}

export class ResetConfirmationRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    token: tokenValue,
    newPassword: passwordValue,
  });

  @ApiProperty({ type: String, maxLength: 512 })
  public token!: string;

  @ApiProperty({
    type: String,
    format: 'password',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: PASSWORD_MAX_LENGTH,
  })
  public newPassword!: string;
}

export class SessionIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ sessionId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public sessionId!: string;
}

export class AccountsQuery {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.uuid().optional(),
  });

  @ApiProperty({ type: Number, required: false, minimum: 1, maximum: 100 })
  public limit?: number;

  @ApiProperty({ type: String, required: false, format: 'uuid' })
  public cursor?: string;
}
