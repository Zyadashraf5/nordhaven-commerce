import { ApplicationAvailabilityService } from './application-availability.service';

describe('ApplicationAvailabilityService', () => {
  it('supports ready, degraded, recovered, and shutdown transitions', () => {
    const state = new ApplicationAvailabilityService();
    expect(state.getState()).toBe('STARTING');
    state.markReady();
    state.markDegraded();
    expect(state.getState()).toBe('DEGRADED');
    state.markReady();
    expect(state.getState()).toBe('READY');
    state.beginShutdown();
    state.markReady();
    expect(state.getState()).toBe('SHUTTING_DOWN');
    state.markStopped();
    expect(state.getState()).toBe('STOPPED');
  });
});
