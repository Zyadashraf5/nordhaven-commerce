import { Body, Controller, Header, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CorrelationId } from '../../../platform/observability/correlation.decorator';
import { Public } from '../../../platform/security/access.decorators';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { clientLabelFromUserAgent } from '../application/identity.support';
import { MfaService } from '../application/mfa.service';
import { RATE_LIMITS } from './identity.policies';
import {
  EnrollmentConfirmationRequest,
  MfaChallengeRequest,
  MfaVerificationRequest,
} from './identity.request';
import {
  EnrollmentConfirmationResponse,
  EnrollmentResponse,
  SessionResponse,
  toUserSummary,
} from './identity.response';

@ApiTags('Multi-factor')
@Controller({ path: 'auth/login/mfa', version: '1' })
export class MfaController {
  public constructor(private readonly mfa: MfaService) {}

  @Post()
  @Public()
  @RateLimit(RATE_LIMITS.mfaChallenge)
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'completeMfaChallenge',
    summary: 'Complete the second factor of sign-in',
    description:
      'Accepts exactly one of a time-based code or a single-use recovery code. The challenge token is single-use and expires.',
  })
  @ApiBody({ type: MfaVerificationRequest })
  @ApiResponse({
    status: 201,
    description: 'The second factor was accepted and a session was issued.',
    type: SessionResponse,
  })
  @errors(400, 401, 429, 500, 503)
  public async complete(
    @Body() body: MfaVerificationRequest,
    @Headers('user-agent') userAgent: string | undefined,
    @CorrelationId() correlationId: string,
  ): Promise<SessionResponse> {
    const outcome = await this.mfa.completeVerification({
      challengeToken: body.challengeToken,
      ...(body.code === undefined ? {} : { code: body.code }),
      ...(body.recoveryCode === undefined ? {} : { recoveryCode: body.recoveryCode }),
      clientLabel: clientLabelFromUserAgent(userAgent),
      correlationId,
    });

    return {
      status: 'AUTHENTICATED',
      token: outcome.session.token,
      tokenType: 'Bearer',
      expiresAt: outcome.session.expiresAt.toISOString(),
      user: toUserSummary(outcome.user),
    };
  }

  @Post('enrollment')
  @Public()
  @RateLimit(RATE_LIMITS.mfaEnrollment)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'beginMfaEnrollment',
    summary: 'Begin administrator multi-factor enrollment',
    description:
      'Turns a single-use enrollment challenge into shared secret material. Only the enrolled administrator can see it.',
  })
  @ApiBody({ type: MfaChallengeRequest })
  @ApiResponse({
    status: 200,
    description: 'Shared secret material for the pending enrollment.',
    type: EnrollmentResponse,
  })
  @errors(400, 401, 409, 429, 500, 503)
  public async beginEnrollment(
    @Body() body: MfaChallengeRequest,
    @CorrelationId() correlationId: string,
  ): Promise<EnrollmentResponse> {
    const details = await this.mfa.beginEnrollment(body.challengeToken, correlationId);
    return {
      secret: details.secret,
      otpauthUri: details.otpauthUri,
      algorithm: details.algorithm,
      digits: details.digits,
      period: details.periodSeconds,
      issuer: details.issuer,
      expiresAt: details.expiresAt.toISOString(),
    };
  }

  @Post('enrollment/confirmation')
  @Public()
  @RateLimit(RATE_LIMITS.mfaEnrollmentConfirmation)
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'confirmMfaEnrollment',
    summary: 'Confirm administrator multi-factor enrollment',
    description:
      'Verifies the first time-based code, then issues recovery codes exactly once and consumes the challenge.',
  })
  @ApiBody({ type: EnrollmentConfirmationRequest })
  @ApiResponse({
    status: 201,
    description: 'Enrollment was confirmed and recovery codes were issued once.',
    type: EnrollmentConfirmationResponse,
  })
  @errors(400, 401, 409, 429, 500, 503)
  public async confirmEnrollment(
    @Body() body: EnrollmentConfirmationRequest,
    @CorrelationId() correlationId: string,
  ): Promise<EnrollmentConfirmationResponse> {
    const confirmation = await this.mfa.confirmEnrollment(
      body.challengeToken,
      body.code,
      correlationId,
    );
    return {
      status: 'MFA_ENROLLED',
      recoveryCodes: [...confirmation.recoveryCodes],
      confirmedAt: confirmation.confirmedAt.toISOString(),
    };
  }
}
