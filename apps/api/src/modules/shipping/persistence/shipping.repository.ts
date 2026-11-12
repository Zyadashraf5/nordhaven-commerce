import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DatabaseService } from '../../../platform/database/database.service';
import type {
  ReturnEventRecord,
  ReturnLineRecord,
  ReturnRecord,
  ReturnStatusValue,
  ShipmentEventRecord,
  ShipmentLineRecord,
  ShipmentRecord,
  ShipmentStatusValue,
  ShippingDestinationRecord,
  ShippingMethodRecord,
} from '../contracts';

/** The attributes of a recorded shipment transition. */
export interface ShipmentEventAttributes {
  readonly eventType: string;
  readonly previousStatus: ShipmentStatusValue | null;
  readonly nextStatus: ShipmentStatusValue | null;
  readonly actor: 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  readonly actorUserId: string | null;
  readonly reason: string | null;
  readonly detail?: Prisma.InputJsonValue | undefined;
}

/** The attributes of a recorded return transition. */
export interface ReturnEventAttributes {
  readonly eventType: string;
  readonly previousStatus: ReturnStatusValue | null;
  readonly nextStatus: ReturnStatusValue | null;
  readonly actor: 'CUSTOMER' | 'ADMIN' | 'SYSTEM';
  readonly actorUserId: string | null;
  readonly reason: string | null;
  readonly detail?: Prisma.InputJsonValue | undefined;
}

const DESTINATION_SELECT = {
  countryCode: true,
  environment: true,
  enabled: true,
  label: true,
  carrierCode: true,
  updatedByUserId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ShippingDestinationSelect;

const METHOD_SELECT = {
  id: true,
  environment: true,
  code: true,
  label: true,
  destinationCountryCode: true,
  amountMinor: true,
  currency: true,
  active: true,
  updatedByUserId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ShippingMethodSelect;

const SHIPMENT_SELECT = {
  id: true,
  orderId: true,
  customerId: true,
  status: true,
  destinationCountryCode: true,
  destinationLabel: true,
  methodCode: true,
  methodLabel: true,
  amountMinor: true,
  currency: true,
  trackingReference: true,
  carrierCode: true,
  dispatchedAt: true,
  deliveredAt: true,
  cancelledAt: true,
  statusReason: true,
  createdAt: true,
  updatedAt: true,
  lines: { select: { id: true, shipmentId: true, orderLineId: true, quantity: true } },
} satisfies Prisma.ShipmentSelect;

const SHIPMENT_EVENT_SELECT = {
  id: true,
  shipmentId: true,
  eventType: true,
  previousStatus: true,
  nextStatus: true,
  actor: true,
  actorUserId: true,
  reason: true,
  detail: true,
  createdAt: true,
} satisfies Prisma.ShipmentEventSelect;

const RETURN_SELECT = {
  id: true,
  orderId: true,
  customerId: true,
  status: true,
  reasonCode: true,
  currency: true,
  totalMinor: true,
  refundId: true,
  refundStatus: true,
  receivedAt: true,
  decidedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  lines: {
    select: {
      id: true,
      returnId: true,
      orderLineId: true,
      quantity: true,
      restocked: true,
      amountMinor: true,
    },
  },
} satisfies Prisma.ReturnRequestSelect;

const RETURN_EVENT_SELECT = {
  id: true,
  returnId: true,
  eventType: true,
  previousStatus: true,
  nextStatus: true,
  actor: true,
  actorUserId: true,
  reason: true,
  detail: true,
  createdAt: true,
} satisfies Prisma.ReturnEventSelect;

type ShipmentRow = Prisma.ShipmentGetPayload<{ select: typeof SHIPMENT_SELECT }>;
type ReturnRow = Prisma.ReturnRequestGetPayload<{ select: typeof RETURN_SELECT }>;

function toShipmentRecord(row: ShipmentRow): ShipmentRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    customerId: row.customerId,
    status: row.status,
    destinationCountryCode: row.destinationCountryCode,
    destinationLabel: row.destinationLabel,
    methodCode: row.methodCode,
    methodLabel: row.methodLabel,
    amountMinor: row.amountMinor,
    currency: row.currency,
    trackingReference: row.trackingReference,
    carrierCode: row.carrierCode,
    dispatchedAt: row.dispatchedAt,
    deliveredAt: row.deliveredAt,
    cancelledAt: row.cancelledAt,
    statusReason: row.statusReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lines: row.lines.map(
      (line): ShipmentLineRecord => ({
        id: line.id,
        shipmentId: line.shipmentId,
        orderLineId: line.orderLineId,
        quantity: line.quantity,
      }),
    ),
  };
}

function toReturnRecord(row: ReturnRow): ReturnRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    customerId: row.customerId,
    status: row.status,
    reasonCode: row.reasonCode,
    currency: row.currency,
    totalMinor: row.totalMinor,
    refundId: row.refundId,
    refundStatus: row.refundStatus,
    receivedAt: row.receivedAt,
    decidedAt: row.decidedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lines: row.lines.map(
      (line): ReturnLineRecord => ({
        id: line.id,
        returnId: line.returnId,
        orderLineId: line.orderLineId,
        quantity: line.quantity,
        restocked: line.restocked,
        amountMinor: line.amountMinor,
      }),
    ),
  };
}

/**
 * Persistence for the shipping configuration, the shipments, and the returns.
 *
 * The concurrency guarantee lives here: every state change is a **conditional** update whose
 * `WHERE` clause states the state the record is in, so two concurrent transitions cannot both
 * apply, and the transition and its event are written in one transaction.
 */
@Injectable()
export class ShippingRepository {
  public constructor(private readonly database: DatabaseService) {}

  // -------------------------------------------------------------------------------------------
  // The shipping configuration.
  // -------------------------------------------------------------------------------------------

  public async listDestinations(
    environment: string,
  ): Promise<readonly ShippingDestinationRecord[]> {
    const rows = await this.database.prisma.shippingDestination.findMany({
      where: { environment: environment as 'TEST' },
      orderBy: { countryCode: 'asc' },
      select: DESTINATION_SELECT,
    });
    return rows.map((row) => ({
      countryCode: row.countryCode,
      environment: row.environment,
      enabled: row.enabled,
      label: row.label,
      carrierCode: row.carrierCode,
      updatedByUserId: row.updatedByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  public async findDestination(
    countryCode: string,
    environment: string,
  ): Promise<ShippingDestinationRecord | null> {
    const row = await this.database.prisma.shippingDestination.findUnique({
      where: { countryCode_environment: { countryCode, environment: environment as 'TEST' } },
      select: DESTINATION_SELECT,
    });
    if (row === null) return null;
    return {
      countryCode: row.countryCode,
      environment: row.environment,
      enabled: row.enabled,
      label: row.label,
      carrierCode: row.carrierCode,
      updatedByUserId: row.updatedByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public async upsertDestination(input: {
    readonly countryCode: string;
    readonly environment: string;
    readonly enabled: boolean;
    readonly label: string;
    readonly carrierCode: string | null;
    readonly updatedByUserId: string | null;
  }): Promise<ShippingDestinationRecord> {
    return this.database.transaction(async () => {
      const target = `destination:${input.environment}:${input.countryCode}`;
      await this.database.lock('shipping-configuration:' + target);
      const previous = await this.findDestination(input.countryCode, input.environment);
      const row = await this.database.prisma.shippingDestination.upsert({
        where: {
          countryCode_environment: {
            countryCode: input.countryCode,
            environment: input.environment as 'TEST',
          },
        },
        create: {
          countryCode: input.countryCode,
          environment: input.environment as 'TEST',
          enabled: input.enabled,
          label: input.label,
          carrierCode: input.carrierCode,
          updatedByUserId: input.updatedByUserId,
        },
        update: {
          enabled: input.enabled,
          label: input.label,
          carrierCode: input.carrierCode,
          updatedByUserId: input.updatedByUserId,
        },
        select: DESTINATION_SELECT,
      });
      await this.database.prisma.shippingConfigurationEvent.create({
        data: {
          target,
          actorUserId: input.updatedByUserId,
          before:
            previous === null
              ? Prisma.JsonNull
              : (JSON.parse(JSON.stringify(previous)) as Prisma.InputJsonValue),
          after: JSON.parse(JSON.stringify(row)) as Prisma.InputJsonValue,
        },
      });
      return {
        countryCode: row.countryCode,
        environment: row.environment,
        enabled: row.enabled,
        label: row.label,
        carrierCode: row.carrierCode,
        updatedByUserId: row.updatedByUserId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  public async listMethods(environment: string): Promise<readonly ShippingMethodRecord[]> {
    const rows = await this.database.prisma.shippingMethod.findMany({
      where: { environment: environment as 'TEST' },
      orderBy: { code: 'asc' },
      select: METHOD_SELECT,
    });
    return rows.map((row) => ({
      id: row.id,
      environment: row.environment,
      code: row.code,
      label: row.label,
      destinationCountryCode: row.destinationCountryCode,
      amountMinor: row.amountMinor,
      currency: row.currency,
      active: row.active,
      updatedByUserId: row.updatedByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  public async findMethod(code: string, environment: string): Promise<ShippingMethodRecord | null> {
    const row = await this.database.prisma.shippingMethod.findUnique({
      where: { environment_code: { code, environment: environment as 'TEST' } },
      select: METHOD_SELECT,
    });
    if (row === null) return null;
    return {
      id: row.id,
      environment: row.environment,
      code: row.code,
      label: row.label,
      destinationCountryCode: row.destinationCountryCode,
      amountMinor: row.amountMinor,
      currency: row.currency,
      active: row.active,
      updatedByUserId: row.updatedByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public async upsertMethod(input: {
    readonly code: string;
    readonly environment: string;
    readonly label: string;
    readonly destinationCountryCode: string | null;
    readonly amountMinor: number;
    readonly currency: string;
    readonly active: boolean;
    readonly updatedByUserId: string | null;
  }): Promise<ShippingMethodRecord> {
    return this.database.transaction(async () => {
      const target = `method:${input.environment}:${input.code}`;
      await this.database.lock('shipping-configuration:' + target);
      const previous = await this.findMethod(input.code, input.environment);
      const row = await this.database.prisma.shippingMethod.upsert({
        where: { environment_code: { code: input.code, environment: input.environment as 'TEST' } },
        create: {
          environment: input.environment as 'TEST',
          code: input.code,
          label: input.label,
          destinationCountryCode: input.destinationCountryCode,
          amountMinor: input.amountMinor,
          currency: input.currency,
          active: input.active,
          updatedByUserId: input.updatedByUserId,
        },
        update: {
          label: input.label,
          destinationCountryCode: input.destinationCountryCode,
          amountMinor: input.amountMinor,
          currency: input.currency,
          active: input.active,
          updatedByUserId: input.updatedByUserId,
        },
        select: METHOD_SELECT,
      });
      await this.database.prisma.shippingConfigurationEvent.create({
        data: {
          target,
          actorUserId: input.updatedByUserId,
          before:
            previous === null
              ? Prisma.JsonNull
              : (JSON.parse(JSON.stringify(previous)) as Prisma.InputJsonValue),
          after: JSON.parse(JSON.stringify(row)) as Prisma.InputJsonValue,
        },
      });
      return {
        id: row.id,
        environment: row.environment,
        code: row.code,
        label: row.label,
        destinationCountryCode: row.destinationCountryCode,
        amountMinor: row.amountMinor,
        currency: row.currency,
        active: row.active,
        updatedByUserId: row.updatedByUserId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  // -------------------------------------------------------------------------------------------
  // The shipments.
  // -------------------------------------------------------------------------------------------

  public async createShipment(input: {
    readonly orderId: string;
    readonly customerId: string;
    readonly destinationCountryCode: string;
    readonly destinationLabel: string;
    readonly methodCode: string;
    readonly methodLabel: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly carrierCode: string | null;
    readonly lines: readonly { readonly orderLineId: string; readonly quantity: number }[];
    readonly event: ShipmentEventAttributes;
  }): Promise<ShipmentRecord> {
    const row = await this.database.prisma.$transaction(async (transaction) => {
      const created = await transaction.shipment.create({
        data: {
          orderId: input.orderId,
          customerId: input.customerId,
          status: 'PREPARED',
          destinationCountryCode: input.destinationCountryCode,
          destinationLabel: input.destinationLabel,
          methodCode: input.methodCode,
          methodLabel: input.methodLabel,
          amountMinor: input.amountMinor,
          currency: input.currency,
          carrierCode: input.carrierCode,
          lines: { create: input.lines.map((line) => ({ ...line })) },
        },
        select: SHIPMENT_SELECT,
      });
      await transaction.shipmentEvent.create({
        data: {
          shipmentId: created.id,
          eventType: input.event.eventType,
          previousStatus: input.event.previousStatus,
          nextStatus: input.event.nextStatus,
          actor: input.event.actor,
          actorUserId: input.event.actorUserId,
          reason: input.event.reason,
          ...(input.event.detail === undefined ? {} : { detail: input.event.detail }),
        },
      });
      return created;
    });
    return toShipmentRecord(row);
  }

  public async findShipmentById(id: string): Promise<ShipmentRecord | null> {
    const row = await this.database.prisma.shipment.findUnique({
      where: { id },
      select: SHIPMENT_SELECT,
    });
    return row === null ? null : toShipmentRecord(row);
  }

  public async findShipmentByOrder(orderId: string): Promise<ShipmentRecord | null> {
    const row = await this.database.prisma.shipment.findUnique({
      where: { orderId },
      select: SHIPMENT_SELECT,
    });
    return row === null ? null : toShipmentRecord(row);
  }

  public async listShipmentsForCustomer(
    customerId: string,
    limit: number,
  ): Promise<readonly ShipmentRecord[]> {
    const rows = await this.database.prisma.shipment.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: SHIPMENT_SELECT,
    });
    return rows.map(toShipmentRecord);
  }

  public async listShipments(limit: number): Promise<readonly ShipmentRecord[]> {
    const rows = await this.database.prisma.shipment.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: SHIPMENT_SELECT,
    });
    return rows.map(toShipmentRecord);
  }

  /**
   * Moves a shipment to a new state and records the transition, in one transaction.
   *
   * The update is conditional on the shipment's **current** state, so two concurrent transitions
   * cannot both apply.
   */
  public async transitionShipment(
    shipmentId: string,
    from: ShipmentStatusValue,
    to: ShipmentStatusValue,
    event: ShipmentEventAttributes,
    changes: {
      readonly statusReason?: string | null | undefined;
      readonly trackingReference?: string | null | undefined;
      readonly dispatchedAt?: Date | null | undefined;
      readonly deliveredAt?: Date | null | undefined;
      readonly cancelledAt?: Date | null | undefined;
    } = {},
  ): Promise<ShipmentRecord | null> {
    const row = await this.database.prisma.$transaction(async (transaction) => {
      const updated = await transaction.shipment.updateMany({
        where: { id: shipmentId, status: from },
        data: {
          status: to,
          ...(changes.statusReason === undefined ? {} : { statusReason: changes.statusReason }),
          ...(changes.trackingReference === undefined
            ? {}
            : { trackingReference: changes.trackingReference }),
          ...(changes.dispatchedAt === undefined ? {} : { dispatchedAt: changes.dispatchedAt }),
          ...(changes.deliveredAt === undefined ? {} : { deliveredAt: changes.deliveredAt }),
          ...(changes.cancelledAt === undefined ? {} : { cancelledAt: changes.cancelledAt }),
        },
      });
      if (updated.count === 0) return null;
      await transaction.shipmentEvent.create({
        data: {
          shipmentId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          nextStatus: event.nextStatus,
          actor: event.actor,
          actorUserId: event.actorUserId,
          reason: event.reason,
          ...(event.detail === undefined ? {} : { detail: event.detail }),
        },
      });
      const current = await transaction.shipment.findUnique({
        where: { id: shipmentId },
        select: SHIPMENT_SELECT,
      });
      if (current === null) throw new Error('The shipment disappeared during a transition');
      return current;
    });
    return row === null ? null : toShipmentRecord(row);
  }

  /** Records a shipment event without changing the shipment's state. */
  public async recordShipmentEvent(
    shipmentId: string,
    event: ShipmentEventAttributes,
  ): Promise<void> {
    await this.database.prisma.shipmentEvent.create({
      data: {
        shipmentId,
        eventType: event.eventType,
        previousStatus: event.previousStatus,
        nextStatus: event.nextStatus,
        actor: event.actor,
        actorUserId: event.actorUserId,
        reason: event.reason,
        ...(event.detail === undefined ? {} : { detail: event.detail }),
      },
    });
  }

  public async listShipmentEvents(shipmentId: string): Promise<readonly ShipmentEventRecord[]> {
    const rows = await this.database.prisma.shipmentEvent.findMany({
      where: { shipmentId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: SHIPMENT_EVENT_SELECT,
    });
    return rows.map((row) => ({
      id: row.id,
      shipmentId: row.shipmentId,
      eventType: row.eventType,
      previousStatus: row.previousStatus,
      nextStatus: row.nextStatus,
      actor: row.actor as 'CUSTOMER' | 'ADMIN' | 'SYSTEM',
      actorUserId: row.actorUserId,
      reason: row.reason,
      detail: row.detail,
      createdAt: row.createdAt,
    }));
  }

  // -------------------------------------------------------------------------------------------
  // The returns.
  // -------------------------------------------------------------------------------------------

  public async createReturn(input: {
    readonly orderId: string;
    readonly customerId: string;
    readonly reasonCode: string;
    readonly currency: string;
    readonly totalMinor: number;
    readonly lines: readonly {
      readonly orderLineId: string;
      readonly quantity: number;
      readonly amountMinor: number;
    }[];
    readonly event: ReturnEventAttributes;
  }): Promise<ReturnRecord> {
    const row = await this.database.prisma.$transaction(async (transaction) => {
      const created = await transaction.returnRequest.create({
        data: {
          orderId: input.orderId,
          customerId: input.customerId,
          status: 'REQUESTED',
          reasonCode: input.reasonCode,
          currency: input.currency,
          totalMinor: input.totalMinor,
          lines: { create: input.lines.map((line) => ({ ...line })) },
        },
        select: RETURN_SELECT,
      });
      await transaction.returnEvent.create({
        data: {
          returnId: created.id,
          eventType: input.event.eventType,
          previousStatus: input.event.previousStatus,
          nextStatus: input.event.nextStatus,
          actor: input.event.actor,
          actorUserId: input.event.actorUserId,
          reason: input.event.reason,
          ...(input.event.detail === undefined ? {} : { detail: input.event.detail }),
        },
      });
      return created;
    });
    return toReturnRecord(row);
  }

  /** Outstanding quantity/money claims, read while the order return lock is held. */
  public async claimedReturnLines(
    orderId: string,
  ): Promise<readonly { orderLineId: string; quantity: number; amountMinor: number | null }[]> {
    const rows = await this.database.prisma.returnRequest.findMany({
      where: { orderId, status: { notIn: ['REJECTED', 'CANCELLED'] } },
      select: { lines: { select: { orderLineId: true, quantity: true, amountMinor: true } } },
    });
    return rows.flatMap((row) => row.lines);
  }

  public async findReturnById(id: string): Promise<ReturnRecord | null> {
    const row = await this.database.prisma.returnRequest.findUnique({
      where: { id },
      select: RETURN_SELECT,
    });
    return row === null ? null : toReturnRecord(row);
  }

  public async listReturnsForCustomer(
    customerId: string,
    limit: number,
  ): Promise<readonly ReturnRecord[]> {
    const rows = await this.database.prisma.returnRequest.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: RETURN_SELECT,
    });
    return rows.map(toReturnRecord);
  }

  public async listReturns(limit: number): Promise<readonly ReturnRecord[]> {
    const rows = await this.database.prisma.returnRequest.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: RETURN_SELECT,
    });
    return rows.map(toReturnRecord);
  }

  /**
   * Moves a return to a new state and records the transition, in one transaction.
   *
   * The update is conditional on the return's **current** state, so two concurrent transitions
   * cannot both apply and a repeated receive cannot restock twice.
   */
  public async transitionReturn(
    returnId: string,
    from: ReturnStatusValue,
    to: ReturnStatusValue,
    event: ReturnEventAttributes,
    changes: {
      readonly refundId?: string | null | undefined;
      readonly refundStatus?: string | null | undefined;
      readonly receivedAt?: Date | null | undefined;
      readonly decidedAt?: Date | null | undefined;
      readonly cancelledAt?: Date | null | undefined;
    } = {},
  ): Promise<ReturnRecord | null> {
    const row = await this.database.prisma.$transaction(async (transaction) => {
      const updated = await transaction.returnRequest.updateMany({
        where: { id: returnId, status: from },
        data: {
          status: to,
          ...(changes.refundId === undefined ? {} : { refundId: changes.refundId }),
          ...(changes.refundStatus === undefined ? {} : { refundStatus: changes.refundStatus }),
          ...(changes.receivedAt === undefined ? {} : { receivedAt: changes.receivedAt }),
          ...(changes.decidedAt === undefined ? {} : { decidedAt: changes.decidedAt }),
          ...(changes.cancelledAt === undefined ? {} : { cancelledAt: changes.cancelledAt }),
        },
      });
      if (updated.count === 0) return null;
      await transaction.returnEvent.create({
        data: {
          returnId,
          eventType: event.eventType,
          previousStatus: event.previousStatus,
          nextStatus: event.nextStatus,
          actor: event.actor,
          actorUserId: event.actorUserId,
          reason: event.reason,
          ...(event.detail === undefined ? {} : { detail: event.detail }),
        },
      });
      const current = await transaction.returnRequest.findUnique({
        where: { id: returnId },
        select: RETURN_SELECT,
      });
      if (current === null) throw new Error('The return disappeared during a transition');
      return current;
    });
    return row === null ? null : toReturnRecord(row);
  }

  /** Records a return event without changing the return's state. */
  public async recordReturnEvent(returnId: string, event: ReturnEventAttributes): Promise<void> {
    await this.database.prisma.returnEvent.create({
      data: {
        returnId,
        eventType: event.eventType,
        previousStatus: event.previousStatus,
        nextStatus: event.nextStatus,
        actor: event.actor,
        actorUserId: event.actorUserId,
        reason: event.reason,
        ...(event.detail === undefined ? {} : { detail: event.detail }),
      },
    });
  }

  public async listReturnEvents(returnId: string): Promise<readonly ReturnEventRecord[]> {
    const rows = await this.database.prisma.returnEvent.findMany({
      where: { returnId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: RETURN_EVENT_SELECT,
    });
    return rows.map((row) => ({
      id: row.id,
      returnId: row.returnId,
      eventType: row.eventType,
      previousStatus: row.previousStatus,
      nextStatus: row.nextStatus,
      actor: row.actor as 'CUSTOMER' | 'ADMIN' | 'SYSTEM',
      actorUserId: row.actorUserId,
      reason: row.reason,
      detail: row.detail,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Marks a returned line as restocked, conditionally.
   *
   * The flag is what makes a repeated receive harmless: the second attempt finds the line already
   * restocked and does not restock it again.
   */
  public async markReturnLineRestocked(returnLineId: string): Promise<boolean> {
    const updated = await this.database.prisma.returnLine.updateMany({
      where: { id: returnLineId, restocked: false },
      data: { restocked: true },
    });
    return updated.count > 0;
  }
  public async shipmentStateCounts(): Promise<readonly { state: string; count: number }[]> {
    const rows = await this.database.prisma.shipment.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return rows
      .map((row) => ({ state: row.status, count: row._count._all }))
      .sort((a, b) => a.state.localeCompare(b.state));
  }
  public async shipmentCustomerIdsAfter(
    cursor: string | null,
    limit: number,
  ): Promise<readonly string[]> {
    const rows = await this.database.prisma.shipment.groupBy({
      by: ['customerId'],
      where: cursor === null ? {} : { customerId: { gt: cursor } },
      orderBy: { customerId: 'asc' },
      take: limit,
    });
    return rows.map((row) => row.customerId);
  }
  public async shipmentCustomerCounts(
    ids: readonly string[],
  ): Promise<readonly { customerId: string; count: number }[]> {
    if (ids.length === 0) return [];
    const rows = await this.database.prisma.shipment.groupBy({
      by: ['customerId'],
      where: { customerId: { in: [...ids] } },
      _count: { _all: true },
    });
    return rows.map((row) => ({ customerId: row.customerId, count: row._count._all }));
  }
  public async shipmentIdsForCustomer(
    customerId: string,
    limit: number,
  ): Promise<readonly string[]> {
    const rows = await this.database.prisma.shipment.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
  public async returnStateCounts(): Promise<readonly { state: string; count: number }[]> {
    const rows = await this.database.prisma.returnRequest.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return rows
      .map((row) => ({ state: row.status, count: row._count._all }))
      .sort((a, b) => a.state.localeCompare(b.state));
  }
  public async returnCustomerIdsAfter(
    cursor: string | null,
    limit: number,
  ): Promise<readonly string[]> {
    const rows = await this.database.prisma.returnRequest.groupBy({
      by: ['customerId'],
      where: cursor === null ? {} : { customerId: { gt: cursor } },
      orderBy: { customerId: 'asc' },
      take: limit,
    });
    return rows.map((row) => row.customerId);
  }
  public async returnCustomerCounts(
    ids: readonly string[],
  ): Promise<readonly { customerId: string; count: number }[]> {
    if (ids.length === 0) return [];
    const rows = await this.database.prisma.returnRequest.groupBy({
      by: ['customerId'],
      where: { customerId: { in: [...ids] } },
      _count: { _all: true },
    });
    return rows.map((row) => ({ customerId: row.customerId, count: row._count._all }));
  }
  public async returnIdsForCustomer(customerId: string, limit: number): Promise<readonly string[]> {
    const rows = await this.database.prisma.returnRequest.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}

/** Raised when a shipment already exists for an order. */
export class ShipmentAlreadyExistsError extends Error {
  public constructor() {
    super('A shipment already exists for that order');
    this.name = 'ShipmentAlreadyExistsError';
  }
}
