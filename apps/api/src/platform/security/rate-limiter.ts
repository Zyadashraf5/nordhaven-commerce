import { Injectable } from '@nestjs/common';

export interface RateLimitPolicy {
  /** Stable policy identifier; part of the bucket key so policies never share a counter. */
  readonly id: string;
  readonly limit: number;
  readonly windowSeconds: number;
  /**
   * `client` bounds a single caller across every account. `client-and-account` additionally
   * separates counters per normalized account identifier found in an already-parsed body.
   */
  readonly key: 'client' | 'client-and-account';
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

/**
 * Upper bound on retained windows. Reaching it triggers a prune of expired windows so a hostile
 * caller cannot grow memory without bound.
 */
const MAX_TRACKED_KEYS = 20_000;

/**
 * Process-local fixed-window limiter.
 *
 * Scope limitation (recorded in the specification and quickstart): counters live in one process and
 * reset on restart. Durable, restart-surviving protection against distributed guessing is provided
 * by the account lockout stored on the user record.
 */
export class FixedWindowRateLimiter {
  private lastPruneAtMs = Number.NEGATIVE_INFINITY;
  private readonly windows = new Map<string, { count: number; resetAtMs: number }>();

  public constructor(private readonly now: () => number = () => Date.now()) {}

  public consume(bucketKey: string, policy: RateLimitPolicy): RateLimitDecision {
    const nowMs = this.now();
    this.prune(nowMs);
    const windowMs = policy.windowSeconds * 1000;
    const existing = this.windows.get(bucketKey);
    if (existing === undefined || existing.resetAtMs <= nowMs) {
      if (existing === undefined && this.windows.size >= MAX_TRACKED_KEYS) {
        return { allowed: false, retryAfterSeconds: Math.max(1, policy.windowSeconds) };
      }
      this.windows.set(bucketKey, { count: 1, resetAtMs: nowMs + windowMs });
      return { allowed: true, retryAfterSeconds: policy.windowSeconds };
    }
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAtMs - nowMs) / 1000));
    if (existing.count >= policy.limit) {
      return { allowed: false, retryAfterSeconds };
    }
    existing.count += 1;
    return { allowed: true, retryAfterSeconds };
  }

  public trackedKeys(): number {
    return this.windows.size;
  }

  private prune(nowMs: number): void {
    if (this.windows.size < MAX_TRACKED_KEYS || nowMs - this.lastPruneAtMs < 1000) return;
    this.lastPruneAtMs = nowMs;
    for (const [key, window] of this.windows) {
      if (window.resetAtMs <= nowMs) this.windows.delete(key);
    }
  }
}

@Injectable()
export class RateLimiterService {
  private readonly limiter = new FixedWindowRateLimiter();

  public consume(bucketKey: string, policy: RateLimitPolicy): RateLimitDecision {
    return this.limiter.consume(bucketKey, policy);
  }

  public trackedKeys(): number {
    return this.limiter.trackedKeys();
  }
}
