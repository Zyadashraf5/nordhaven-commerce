import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DatabaseService } from '../../../platform/database/database.service';

/** One approved checkout destination, as the Checkout capability persists it. */
export interface CheckoutDestinationRecord {
  readonly countryCode: string;
  readonly environment: 'TEST' | 'PRODUCTION';
  readonly enabled: boolean;
  readonly taxJurisdiction: string;
  readonly shippingApproved: boolean;
  readonly label: string;
  readonly updatedByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** The attributes an administrator may set on a checkout destination. */
export interface CheckoutDestinationAttributes {
  readonly environment: 'TEST' | 'PRODUCTION';
  readonly enabled: boolean;
  readonly taxJurisdiction: string;
  readonly shippingApproved: boolean;
  readonly label: string;
  readonly updatedByUserId: string | null;
}

const DESTINATION_SELECT = {
  countryCode: true,
  environment: true,
  enabled: true,
  taxJurisdiction: true,
  shippingApproved: true,
  label: true,
  updatedByUserId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CheckoutDestinationSelect;

/**
 * Persistence for the approved checkout destinations.
 *
 * The Checkout capability owns this table. A destination is environment-scoped, so a production
 * request finds no destination until one is approved and configured for the production
 * environment, and a `TEST` destination can never enable a production checkout.
 */
@Injectable()
export class CheckoutDestinationRepository {
  public constructor(private readonly database: DatabaseService) {}

  /** Every destination of one environment, in a deterministic order. */
  public async list(environment: 'TEST' | 'PRODUCTION'): Promise<CheckoutDestinationRecord[]> {
    return this.database.prisma.checkoutDestination.findMany({
      where: { environment },
      orderBy: [{ countryCode: 'asc' }],
      select: DESTINATION_SELECT,
    });
  }

  /** The destination of one country in one environment, or null when none is approved. */
  public async find(
    countryCode: string,
    environment: 'TEST' | 'PRODUCTION',
  ): Promise<CheckoutDestinationRecord | null> {
    return this.database.prisma.checkoutDestination.findUnique({
      where: { countryCode_environment: { countryCode, environment } },
      select: DESTINATION_SELECT,
    });
  }

  /** Creates or replaces a destination. */
  public async upsert(
    countryCode: string,
    attributes: CheckoutDestinationAttributes,
  ): Promise<CheckoutDestinationRecord> {
    return this.database.transaction(async () => {
      await this.database.lock(`checkout-destination:${attributes.environment}:${countryCode}`);
      const previous = await this.find(countryCode, attributes.environment);
      const current = await this.database.prisma.checkoutDestination.upsert({
        where: { countryCode_environment: { countryCode, environment: attributes.environment } },
        create: { countryCode, ...attributes },
        update: { ...attributes },
        select: DESTINATION_SELECT,
      });
      await this.record(
        `${attributes.environment}:${countryCode}`,
        previous === null ? 'CREATE' : 'REPLACE',
        attributes.updatedByUserId,
        previous,
        current,
      );
      return current;
    });
  }

  /** Removes a destination. */
  public async delete(
    countryCode: string,
    environment: 'TEST' | 'PRODUCTION',
    actorUserId: string | null = null,
  ): Promise<void> {
    await this.database.transaction(async () => {
      await this.database.lock(`checkout-destination:${environment}:${countryCode}`);
      const previous = await this.database.prisma.checkoutDestination.delete({
        where: { countryCode_environment: { countryCode, environment } },
      });
      await this.record(`${environment}:${countryCode}`, 'DELETE', actorUserId, previous, null);
    });
  }

  private async record(
    target: string,
    action: string,
    actorUserId: string | null,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await this.database.prisma.checkoutConfigurationEvent.create({
      data: {
        target,
        action,
        actorUserId,
        before:
          before === null
            ? Prisma.JsonNull
            : (JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue),
        after:
          after === null
            ? Prisma.JsonNull
            : (JSON.parse(JSON.stringify(after)) as Prisma.InputJsonValue),
      },
    });
  }
}
