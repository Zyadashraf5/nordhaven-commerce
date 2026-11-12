import { Body, Controller, Header, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CorrelationId } from '../../../platform/observability/correlation.decorator';
import { Public } from '../../../platform/security/access.decorators';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { IdentityService } from '../application/identity.service';
import { RATE_LIMITS } from './identity.policies';
import { RegisterRequest } from './identity.request';
import { RegistrationResponse, toUserSummary } from './identity.response';

@ApiTags('Registration')
@Controller({ path: 'auth', version: '1' })
export class RegistrationController {
  public constructor(private readonly identity: IdentityService) {}

  @Post('register')
  @Public()
  @RateLimit(RATE_LIMITS.register)
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'registerAccount',
    summary: 'Register a customer account',
    description:
      'Creates a customer account. Registration is self-service and always creates the customer role.',
  })
  @ApiBody({ type: RegisterRequest })
  @ApiResponse({
    status: 201,
    description: 'The account was created.',
    type: RegistrationResponse,
  })
  @errors(400, 409, 429, 500, 503)
  public async register(
    @Body() body: RegisterRequest,
    @CorrelationId() correlationId: string,
  ): Promise<RegistrationResponse> {
    const user = await this.identity.register({
      email: body.email,
      password: body.password,
      correlationId,
    });
    return { user: toUserSummary(user) };
  }
}
