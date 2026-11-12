import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { IdentityService } from '../application/identity.service';
import { RATE_LIMITS } from './identity.policies';
import { AccountsQuery } from './identity.request';
import { AccountsResponse, toUserSummary } from './identity.response';

@ApiTags('Accounts')
@Controller({ path: 'admin/users', version: '1' })
export class AccountsController {
  public constructor(private readonly identity: IdentityService) {}

  @Get()
  @Roles('ADMIN')
  @RateLimit(RATE_LIMITS.accountList)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAccounts',
    summary: 'List accounts',
    description:
      'Administrative listing. The role is taken from the server-resolved principal, and every grant and denial is recorded as a security event.',
  })
  @ApiResponse({ status: 200, description: 'A page of accounts.', type: AccountsResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(
    @Query() query: AccountsQuery,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<AccountsResponse> {
    const page = await this.identity.listAccounts(principal, {
      ...(query.limit === undefined ? {} : { limit: query.limit }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });
    return { users: page.users.map(toUserSummary), nextCursor: page.nextCursor };
  }
}
