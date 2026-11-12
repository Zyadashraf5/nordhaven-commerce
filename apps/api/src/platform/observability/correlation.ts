import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const correlations = new WeakMap<object, string>();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveCorrelationId(candidate: string | string[] | undefined): string {
  const value = Array.isArray(candidate) ? undefined : candidate;
  return value !== undefined && uuidPattern.test(value) ? value.toLowerCase() : randomUUID();
}

export function assignCorrelationId(request: IncomingMessage): string {
  const correlationId = resolveCorrelationId(request.headers['x-correlation-id']);
  correlations.set(request, correlationId);
  return correlationId;
}

export function getCorrelationId(request: object): string {
  const existing = correlations.get(request);
  if (existing !== undefined) return existing;
  const generated = randomUUID();
  correlations.set(request, generated);
  return generated;
}
