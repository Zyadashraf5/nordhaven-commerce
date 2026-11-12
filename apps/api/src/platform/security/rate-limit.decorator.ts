import { SetMetadata } from '@nestjs/common';
import type { RateLimitPolicy } from './rate-limiter';

export const RATE_LIMIT_POLICY = 'nordhaven:rateLimitPolicy';

/** Declares the fixed-window policy enforced by the global rate-limit guard. */
export function RateLimit(policy: RateLimitPolicy): MethodDecorator & ClassDecorator {
  return SetMetadata(RATE_LIMIT_POLICY, policy);
}
