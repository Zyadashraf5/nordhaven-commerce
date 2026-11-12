import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CorrelationId } from '../../../platform/observability/correlation.decorator';
import { CurrentPrincipal, Public } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { IdentityService } from '../application/identity.service';
import { clientLabelFromUserAgent } from '../application/identity.support';
import { SessionService } from '../application/session.service';
import { RATE_LIMITS } from './identity.policies';
import { SessionIdParam, SignInRequest } from './identity.request';
import {
  PrincipalResponse,
  SessionsResponse,
  SignInResponse,
  toChallenge,
  toSessionSummary,
  toUserSummary,
} from './identity.response';

@ApiTags('Sessions')
@Controller({ path: 'auth', version: '1' })
export class SessionController {
  public constructor(
    private readonly identity: IdentityService,
    private readonly sessions: SessionService,
  ) {}

  @Post('login')
  @Public()
  @RateLimit(RATE_LIMITS.signIn)
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'createSession',
    summary: 'Authenticate with email and password',
    description:
      'Returns a session credential, or a single-use challenge when the account requires a second factor. A wrong password, an unknown account, and a locked account are indistinguishable.',
  })
  @ApiBody({ type: SignInRequest })
  @ApiResponse({
    status: 200,
    description: 'The password was accepted; a session or a challenge follows.',
    type: SignInResponse,
  })
  @errors(400, 401, 429, 500, 503)
  public async signIn(
    @Body() body: SignInRequest,
    @Headers('user-agent') userAgent: string | undefined,
    @CorrelationId() correlationId: string,
  ): Promise<SignInResponse> {
    const result = await this.identity.signIn({
      email: body.email,
      password: body.password,
      clientLabel: clientLabelFromUserAgent(userAgent),
      correlationId,
    });

    if (result.status === 'AUTHENTICATED') {
      return {
        status: 'AUTHENTICATED',
        session: {
          token: result.sessionToken,
          tokenType: 'Bearer',
          expiresAt: result.sessionExpiresAt.toISOString(),
        },
        user: toUserSummary(result.user),
      };
    }

    return { status: result.status, challenge: toChallenge(result.challenge) };
  }

  @Get('principal')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'getPrincipal',
    summary: 'Report the authenticated principal',
  })
  @ApiResponse({
    status: 200,
    description: 'The authenticated principal and the presented session.',
    type: PrincipalResponse,
  })
  @errors(401, 500, 503)
  public async principal(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<PrincipalResponse> {
    const described = await this.identity.describePrincipal(principal);
    return {
      user: toUserSummary(described.user),
      role: principal.role,
      session: toSessionSummary(described.session),
    };
  }

  @Get('sessions')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'listSessions', summary: 'List the sessions of the principal' })
  @ApiResponse({
    status: 200,
    description: 'Usable sessions of the principal; no credential is ever returned.',
    type: SessionsResponse,
  })
  @errors(401, 500, 503)
  public async listSessions(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<SessionsResponse> {
    const sessions = await this.sessions.list(principal.userId, principal.sessionId, new Date());
    return { sessions: sessions.map(toSessionSummary) };
  }

  @Delete('sessions/current')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'revokeCurrentSession', summary: 'Revoke the presented session' })
  @ApiResponse({ status: 204, description: 'The presented session was revoked.' })
  @errors(401, 500, 503)
  public async revokeCurrent(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CorrelationId() correlationId: string,
  ): Promise<void> {
    await this.sessions.revokeCurrent(principal, correlationId);
  }

  @Delete('sessions')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'revokeAllSessions',
    summary: 'Revoke every session of the principal',
  })
  @ApiResponse({ status: 204, description: 'Every session of the principal was revoked.' })
  @errors(401, 500, 503)
  public async revokeAll(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CorrelationId() correlationId: string,
  ): Promise<void> {
    await this.sessions.revokeAllOwn(principal, correlationId);
  }

  @Delete('sessions/:sessionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'revokeSession', summary: 'Revoke one owned session' })
  @ApiResponse({ status: 204, description: 'The owned session was revoked.' })
  @errors(400, 401, 404, 500, 503)
  public async revokeOne(
    @Param() params: SessionIdParam,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @CorrelationId() correlationId: string,
  ): Promise<void> {
    await this.sessions.revokeOwned(params.sessionId, principal, correlationId);
  }
}
