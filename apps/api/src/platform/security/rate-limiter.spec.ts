import { FixedWindowRateLimiter, type RateLimitPolicy } from './rate-limiter';

const policy: RateLimitPolicy = { id: 'test.policy', limit: 3, windowSeconds: 60, key: 'client' };
const shortPolicy: RateLimitPolicy = {
  id: 'test.short',
  limit: 1,
  windowSeconds: 1,
  key: 'client',
};

describe('FixedWindowRateLimiter', () => {
  let nowMs: number;
  let limiter: FixedWindowRateLimiter;

  beforeEach(() => {
    nowMs = 1_750_000_000_000;
    limiter = new FixedWindowRateLimiter(() => nowMs);
  });

  it('allows exactly the declared number of requests inside one window', () => {
    expect(limiter.consume('client-a', policy).allowed).toBe(true);
    expect(limiter.consume('client-a', policy).allowed).toBe(true);
    expect(limiter.consume('client-a', policy).allowed).toBe(true);

    const blocked = limiter.consume('client-a', policy);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it('keeps one caller from consuming another caller budget', () => {
    limiter.consume('client-a', policy);
    limiter.consume('client-a', policy);
    limiter.consume('client-a', policy);
    expect(limiter.consume('client-a', policy).allowed).toBe(false);

    expect(limiter.consume('client-b', policy).allowed).toBe(true);
  });

  it('starts a fresh window once the previous window has expired', () => {
    for (let attempt = 0; attempt < 3; attempt += 1) limiter.consume('client-a', policy);
    expect(limiter.consume('client-a', policy).allowed).toBe(false);

    nowMs += 60_000;
    const next = limiter.consume('client-a', policy);
    expect(next.allowed).toBe(true);
    expect(next.retryAfterSeconds).toBe(60);
  });

  it('reports the remaining wait inside the window and never less than one second', () => {
    for (let attempt = 0; attempt < 3; attempt += 1) limiter.consume('client-a', policy);

    nowMs += 15_000;
    expect(limiter.consume('client-a', policy).retryAfterSeconds).toBe(45);

    nowMs += 44_600;
    expect(limiter.consume('client-a', policy).retryAfterSeconds).toBe(1);
  });

  it('exposes the tracked window count for one bucket per key', () => {
    expect(limiter.trackedKeys()).toBe(0);
    limiter.consume('client-a', policy);
    limiter.consume('client-a', policy);
    expect(limiter.trackedKeys()).toBe(1);
    limiter.consume('client-b', policy);
    expect(limiter.trackedKeys()).toBe(2);
  });

  it('bounds retained windows by pruning the expired ones', () => {
    for (let index = 0; index < 20_000; index += 1) limiter.consume(`client-${index}`, shortPolicy);
    expect(limiter.trackedKeys()).toBe(20_000);

    nowMs += 2_000;
    expect(limiter.consume('client-fresh', shortPolicy).allowed).toBe(true);
    expect(limiter.trackedKeys()).toBe(1);
  });
});
