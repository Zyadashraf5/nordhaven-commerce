import { Module } from '@nestjs/common';
import { AdminTaxController } from './api/admin-tax.controller';
import { TaxService } from './application/tax.service';
import { TAX_ASSESSOR } from './contracts';
import { TaxRepository } from './persistence/tax.repository';

/**
 * Tax module.
 *
 * Owns the tax rules, the product tax classifications, and the tax calculation, and nothing else.
 * It references the catalog's products through the `tax_classifications` foreign key, exactly as
 * the Cart and Wishlist capabilities reference the catalog: it imports no catalog code.
 *
 * The module publishes its assessor so another capability can obtain a tax figure without reading
 * the tax configuration itself. A missing rule is reported rather than treated as a zero rate, so
 * a caller can refuse to complete a quote for a jurisdiction it has not configured.
 */
@Module({
  controllers: [AdminTaxController],
  providers: [TaxRepository, TaxService, { provide: TAX_ASSESSOR, useExisting: TaxService }],
  exports: [TAX_ASSESSOR],
})
export class TaxModule {}
