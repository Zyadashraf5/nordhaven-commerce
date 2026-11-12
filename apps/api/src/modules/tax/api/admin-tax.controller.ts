import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { TaxService } from '../application/tax.service';
import { TAX_RATE_LIMITS } from './tax.policies';
import {
  CreateTaxRuleRequest,
  SetTaxClassificationRequest,
  TaxProductIdParam,
  TaxRuleIdParam,
} from './tax.request';
import { TaxRulesResponse, toTaxRulesResponse } from './tax.response';

/**
 * Administrative tax configuration.
 *
 * Every route requires the `ADMIN` role. A tax rule is configuration data rather than code, so an
 * administrator can add a rate for a jurisdiction and a product classification without a
 * deployment. Every rule carries its environment scope, so a rule created for the test environment
 * can never apply to a production request.
 */
@ApiTags('Tax')
@Roles('ADMIN')
@Controller({ path: 'admin/tax', version: '1' })
export class AdminTaxController {
  public constructor(private readonly taxes: TaxService) {}

  @Get('rules')
  @RateLimit(TAX_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listTaxRules',
    summary: 'List the configured tax rules',
    description:
      'Every configured rule, including its environment, in a deterministic order. A rule states the rate, the product classification, the inclusive or exclusive treatment, and the window it applies in.',
  })
  @ApiResponse({ status: 200, description: 'The configured tax rules.', type: TaxRulesResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(): Promise<TaxRulesResponse> {
    return toTaxRulesResponse(await this.taxes.listRules());
  }

  @Post('rules')
  @RateLimit(TAX_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'createTaxRule',
    summary: 'Configure a tax rule',
    description:
      'A rate is an exact count of basis points. A rule that duplicates another for the same jurisdiction, classification, and start date is refused.',
  })
  @ApiBody({ type: CreateTaxRuleRequest })
  @ApiResponse({ status: 201, description: 'The persisted tax rule.', type: TaxRulesResponse })
  @errors(400, 401, 403, 409, 429, 500, 503)
  public async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: CreateTaxRuleRequest,
  ): Promise<TaxRulesResponse> {
    const rule = await this.taxes.createRule({
      environment: 'TEST',
      jurisdiction: body.jurisdiction,
      classification: body.classification,
      rateBasisPoints: body.rateBasisPoints,
      taxInclusive: body.taxInclusive,
      effectiveFrom: new Date(body.effectiveFrom),
      effectiveTo: body.effectiveTo === null ? null : new Date(body.effectiveTo),
      priority: body.priority,
      updatedByUserId: principal.userId,
    });
    return toTaxRulesResponse([rule]);
  }

  @Delete('rules/:ruleId')
  @RateLimit(TAX_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'ruleId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'deleteTaxRule',
    summary: 'Remove a tax rule',
  })
  @ApiResponse({ status: 204, description: 'The rule was removed.' })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: TaxRuleIdParam,
  ): Promise<void> {
    await this.taxes.removeRule(params.ruleId, principal.userId);
  }

  @Put('products/:productId/classification')
  @RateLimit(TAX_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'productId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'setProductTaxClassification',
    summary: 'Set the tax classification of a product',
    description:
      'The classification decides which rule applies to a product. A product with no classification uses the standard one.',
  })
  @ApiBody({ type: SetTaxClassificationRequest })
  @ApiResponse({ status: 204, description: 'The classification was stored.' })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async setClassification(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: TaxProductIdParam,
    @Body() body: SetTaxClassificationRequest,
  ): Promise<void> {
    await this.taxes.setClassification(params.productId, body.classification, principal.userId);
  }

  @Delete('products/:productId/classification')
  @RateLimit(TAX_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'productId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'clearProductTaxClassification',
    summary: 'Clear the tax classification of a product',
    description: 'The product returns to the standard classification.',
  })
  @ApiResponse({ status: 204, description: 'The classification was removed.' })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async clearClassification(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: TaxProductIdParam,
  ): Promise<void> {
    await this.taxes.clearClassification(params.productId, principal.userId);
  }
}
