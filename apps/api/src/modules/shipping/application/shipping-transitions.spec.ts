import {
  RETURN_TRANSITIONS,
  SHIPMENT_TRANSITIONS,
  returnTransitionPermitted,
  shipmentTransitionPermitted,
} from './shipping-transitions';

/**
 * The shipment and return lifecycles are data, so they are tested as data.
 *
 * A transition that is not permitted must be refused, and the test states the whole permitted set
 * rather than a few examples, so a new state cannot be added without stating what it may become.
 */
describe('the shipping and return lifecycles', () => {
  it('permits exactly the shipment transitions the lifecycle states', () => {
    expect(SHIPMENT_TRANSITIONS).toEqual({
      PREPARED: ['PACKED', 'CANCELLED'],
      PACKED: ['HANDED_OVER', 'CANCELLED'],
      HANDED_OVER: ['DELIVERED'],
      DELIVERED: [],
      CANCELLED: [],
    });
  });

  it('permits exactly the return transitions the lifecycle states', () => {
    expect(RETURN_TRANSITIONS).toEqual({
      REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
      APPROVED: ['RECEIVED', 'CANCELLED'],
      RECEIVED: ['REFUNDED'],
      REJECTED: [],
      REFUNDED: [],
      CANCELLED: [],
    });
  });

  it('walks a shipment from prepared to delivered', () => {
    expect(shipmentTransitionPermitted('PREPARED', 'PACKED')).toBe(true);
    expect(shipmentTransitionPermitted('PACKED', 'HANDED_OVER')).toBe(true);
    expect(shipmentTransitionPermitted('HANDED_OVER', 'DELIVERED')).toBe(true);
  });

  it('refuses a transition out of a terminal shipment state', () => {
    expect(shipmentTransitionPermitted('DELIVERED', 'CANCELLED')).toBe(false);
    expect(shipmentTransitionPermitted('DELIVERED', 'PACKED')).toBe(false);
    expect(shipmentTransitionPermitted('CANCELLED', 'PACKED')).toBe(false);
  });

  it('refuses a transition that skips a state', () => {
    expect(shipmentTransitionPermitted('PREPARED', 'HANDED_OVER')).toBe(false);
    expect(shipmentTransitionPermitted('PREPARED', 'DELIVERED')).toBe(false);
    expect(shipmentTransitionPermitted('PACKED', 'DELIVERED')).toBe(false);
  });

  it('refuses a return transition out of a terminal return state', () => {
    expect(returnTransitionPermitted('REFUNDED', 'RECEIVED')).toBe(false);
    expect(returnTransitionPermitted('REJECTED', 'APPROVED')).toBe(false);
    expect(returnTransitionPermitted('CANCELLED', 'APPROVED')).toBe(false);
  });

  it('refuses a return that skips its review', () => {
    expect(returnTransitionPermitted('REQUESTED', 'RECEIVED')).toBe(false);
    expect(returnTransitionPermitted('REQUESTED', 'REFUNDED')).toBe(false);
    expect(returnTransitionPermitted('APPROVED', 'REFUNDED')).toBe(false);
  });
});
