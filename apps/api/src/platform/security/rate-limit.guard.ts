import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppError } from '../http/app-error';
import { RATE_LIMIT_POLICY } from './rate-limit.decorator';
import { RateLimiterService, type RateLimitPolicy } from './rate-limiter';

const MAX_ACCOUNT_KEY_LENGTH = 320;

function clientIdentifier(request: Request): string {
  return request.ip ?? request.socket.remoteAddress ?? 'unknown-client';
}

/**
 * Reads an account identifier from the already-parsed body without trusting it.
 *
 * The value is only used as a counter dimension; validation still happens later in the request
 * pipeline, and the client dimension is always part of the bucket key, so a caller cannot escape
 * the client limit by varying this field.
 */
function accountIdentifier(request: Request): string | undefined {
  const body: unknown = request.body;
  if (typeof body !== 'object' || body === null) return undefined;
  const email = (body as { email?: unknown }).email;
  if (typeof email !== 'string') return undefined;
  const normalized = email.trim().toLowerCase().slice(0, MAX_ACCOUNT_KEY_LENGTH);
  return normalized.length === 0 ? undefined : normalized;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  public constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiterService,
  ) {}

  public canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy | undefined>(
      RATE_LIMIT_POLICY,
      [context.getHandler(), context.getClass()],
    );
    if (policy === undefined) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const client = clientIdentifier(request);
    const account = policy.key === 'client-and-account' ? accountIdentifier(request) : undefined;
    const clientDecision = this.limiter.consume(`${policy.id}|${client}`, policy);
    if (!clientDecision.allowed) throw AppError.rateLimited(clientDecision.retryAfterSeconds);
    if (account !== undefined) {
      const accountDecision = this.limiter.consume(`${policy.id}|${client}|${account}`, policy);
      if (!accountDecision.allowed) throw AppError.rateLimited(accountDecision.retryAfterSeconds);
    }
    return true;
  }
}
