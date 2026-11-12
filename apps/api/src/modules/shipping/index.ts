export { ShippingModule } from './shipping.module';
export {
  SHIPPING_FULFILLMENT,
  type ReturnEventRecord,
  type ReturnLineRecord,
  type ReturnRecord,
  type ReturnStatusValue,
  type ShipmentEventRecord,
  type ShipmentLineRecord,
  type ShipmentRecord,
  type ShipmentStatusValue,
  type ShippingActorValue,
  type ShippingDestinationRecord,
  type ShippingFulfillment,
  type ShippingMethodRecord,
  type ShippingOption,
} from './contracts';
export {
  RETURN_TRANSITIONS,
  SHIPMENT_TRANSITIONS,
  returnTransitionPermitted,
  shipmentTransitionPermitted,
} from './application/shipping-transitions';
