import { Body, Controller, Header, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CorrelationId } from '../../../platform/observability/correlation.decorator';
import { CurrentPrincipal, Public } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { IdentityService } from '../application/identity.service';
import { PasswordResetService } from '../application/password-reset.service';
import { RATE_LIMITS } from './identity.policies';
import {
  ChangePasswordRequest,
  ResetConfirmationRequest,
  ResetRequestRequest,
} from './identity.request';
import { ResetAcceptedResponse } from './identity.response';

@ApiTags('Passwords')
@Controller({ path: 'auth', version: '1' })
export class PasswordController {
  public constructor(
    private readonly identity: IdentityService,
    private readonly reset: PasswordResetService,
  ) {}

  @Post('password')
  @RateLimit(RATE_LIMITS.passwordChange)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'changePassword',
    summary: 'Change the password of the authenticated account',
    description:
      'Requires the current password again and revokes every other session of the account.',
  })
  @ApiBody({ type: ChangePasswordRequest })
  @ApiResponse({
    status: 204,
    description: 'The password was changed and every other session was revoked.',
  })
  @errors(400, 401, 429, 500, 503)
  public async change(
    @Body() body: ChangePasswordRequest,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CorrelationId() correlationId: string,
  ): Promise<void> {
    await this.identity.changePassword(principal, {
      userId: principal.userId,
      currentSessionId: principal.sessionId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      correlationId,
    });
  }

  @Post('password-reset/requests')
  @Public()
  @RateLimit(RATE_LIMITS.resetRequest)
  @HttpCode(HttpStatus.ACCEPTED)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'requestPasswordReset',
    summary: 'Request a single-use password reset token',
    description:
      'Answers identically whether or not the address is registered, so the response cannot be used to enumerate accounts.',
  })
  @ApiBody({ type: ResetRequestRequest })
  @ApiResponse({
    status: 202,
    description: 'The request was accepted. Delivery of recovery material is out of band.',
    type: ResetAcceptedResponse,
  })
  @errors(400, 429, 500, 503)
  public async request(
    @Body() body: ResetRequestRequest,
    @CorrelationId() correlationId: string,
  ): Promise<ResetAcceptedResponse> {
    await this.reset.requestReset({ email: body.email, correlationId });
    return { status: 'ACCEPTED' };
  }

  @Post('password-reset/confirmations')
  @Public()
  @RateLimit(RATE_LIMITS.resetConfirmation)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'completePasswordReset',
    summary: 'Complete a password reset with a single-use token',
    description: 'Consumes the token and revokes every session of the account.',
  })
  @ApiBody({ type: ResetConfirmationRequest })
  @ApiResponse({
    status: 204,
    description:
      'The password was replaced, the token was consumed, and all sessions were revoked.',
  })
  @errors(400, 429, 500, 503)
  public async complete(
    @Body() body: ResetConfirmationRequest,
    @CorrelationId() correlationId: string,
  ): Promise<void> {
    await this.reset.completeReset({
      token: body.token,
      newPassword: body.newPassword,
      correlationId,
    });
  }
}
