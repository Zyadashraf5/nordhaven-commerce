import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';
import { FixedWindowRateLimiter, RateLimiterService, type RateLimitPolicy } from './rate-limiter';

describe('audit rate-limit regressions', () => {
  it('H05: account rotation cannot exceed the aggregate client budget', () => {
    const policy: RateLimitPolicy = {
      id: 'audit.registration',
      limit: 5,
      windowSeconds: 900,
      key: 'client-and-account',
    };
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(policy);
    const guard = new RateLimitGuard(reflector, new RateLimiterService());
    const context = (index: number) =>
      ({
        getHandler: () => undefined,
        getClass: () => undefined,
        switchToHttp: () => ({
          getRequest: () => ({
            ip: '127.0.0.1',
            socket: { remoteAddress: '127.0.0.1' },
            body: { email: 'customer-' + index + '@example.test' },
          }),
        }),
      }) as unknown as ExecutionContext;
    for (let index = 0; index < 5; index += 1) expect(guard.canActivate(context(index))).toBe(true);
    let rejected: unknown;
    try {
      guard.canActivate(context(5));
    } catch (error: unknown) {
      rejected = error;
    }
    expect(rejected).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('M03: capacity never evicts live budgets or admits an untracked key', () => {
    let now = 0;
    const limiter = new FixedWindowRateLimiter(() => now);
    const policy: RateLimitPolicy = { id: 'capacity', limit: 1, windowSeconds: 60, key: 'client' };
    for (let index = 0; index < 20_005; index += 1) limiter.consume('key-' + index, policy);
    expect(limiter.trackedKeys()).toBe(20_000);
    expect(limiter.consume('key-new', policy).allowed).toBe(false);
    expect(limiter.consume('key-0', policy).allowed).toBe(false);
    now = 60_001;
    expect(limiter.consume('key-new', policy).allowed).toBe(true);
    expect(limiter.trackedKeys()).toBe(1);
  });
});
