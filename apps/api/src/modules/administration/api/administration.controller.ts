import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../../platform/http/app-error';
import { errors } from '../../../platform/http/openapi-error-responses';
import { Roles } from '../../../platform/security/access.decorators';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { AdministrationService } from '../application/administration.service';
import { ADMINISTRATION_RATE_LIMITS } from './administration.policies';
import { AuditQuery, CustomerIdParam, CustomersQuery } from './administration.request';
import {
  AuditTrailResponse,
  CustomerDetailResponse,
  CustomersResponse,
  OperationalOverviewResponse,
  toCustomerDetailResponse,
  toCustomersResponse,
  toOperationalOverviewResponse,
} from './administration.response';

/**
 * The administrative operations surface.
 *
 * Every route requires the `ADMIN` role, and the administrator's session is already protected by
 * the mandatory multi-factor enrollment the Identity capability enforces.
 *
 * The surface is a **read**. It presents the platform's own facts through the capabilities'
 * published contracts, and it owns no rule: every operational action stays in the capability that
 * owns it, so there is no administrative bypass path into another capability's persistence.
 */
@ApiTags('Administration')
@Roles('ADMIN')
@Controller({ path: 'admin', version: '1' })
export class AdministrationController {
  public constructor(private readonly administration: AdministrationService) {}

  @Get('overview')
  @RateLimit(ADMINISTRATION_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'getOperationalOverview',
    summary: "Read the platform's operational picture",
    description:
      'The counts of the orders, shipments, returns, reviews, and messages, and the money the platform holds. Every figure comes from the capability that owns the record.',
  })
  @ApiResponse({
    status: 200,
    description: 'The operational picture.',
    type: OperationalOverviewResponse,
  })
  @errors(400, 401, 403, 429, 500, 503)
  public async overview(): Promise<OperationalOverviewResponse> {
    return toOperationalOverviewResponse(await this.administration.overview());
  }

  @Get('customers')
  @RateLimit(ADMINISTRATION_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listCustomers',
    summary: 'List the customers the platform has records for',
    description:
      'A UUID-keyset page across account and commerce identities, including unlinked historical references. Counts cover full history; use nextCursor to continue without silent truncation.',
  })
  @ApiResponse({ status: 200, description: 'The customers.', type: CustomersResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async customers(@Query() query: CustomersQuery): Promise<CustomersResponse> {
    const page = await this.administration.customersPage(query.limit, query.cursor ?? null);
    return toCustomersResponse(page.customers, page.nextCursor);
  }

  @Get('customers/:customerId')
  @RateLimit(ADMINISTRATION_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'customerId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'getCustomer',
    summary: 'Read one customer with their commerce records',
    description:
      'Full owner-published counts and the newest500 identifiers per record type. recordsTruncated explicitly marks bounded ID lists.',
  })
  @ApiResponse({ status: 200, description: 'The customer.', type: CustomerDetailResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async customer(@Param() params: CustomerIdParam): Promise<CustomerDetailResponse> {
    const detail = await this.administration.customer(params.customerId);
    if (detail === null) throw AppError.customerNotFound();
    return toCustomerDetailResponse(detail);
  }

  @Get('audit')
  @RateLimit(ADMINISTRATION_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAuditEvents',
    summary: "Read the platform's recent security events",
    description:
      "The security trail is the platform's own record of every authentication and authorization decision. It is the audit evidence, and it never carries a credential.",
  })
  @ApiResponse({ status: 200, description: 'The recorded events.', type: AuditTrailResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async audit(@Query() query: AuditQuery): Promise<AuditTrailResponse> {
    const events = await this.administration.securityEvents(query.limit);
    return {
      events: events.map((event) => ({
        eventType: event.eventType,
        outcome: event.outcome,
        actorUserId: event.actorUserId,
        actorRole: event.actorRole,
        correlationId: event.correlationId,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }
}
