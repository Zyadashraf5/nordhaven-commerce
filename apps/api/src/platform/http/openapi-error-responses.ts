import { applyDecorators } from '@nestjs/common';
import { ApiResponse, type ApiResponseOptions } from '@nestjs/swagger';
import { ErrorResponse } from './error-response.dto';

/** Every failure status the safe error envelope can produce. */
export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 429 | 500 | 503;

const DESCRIPTIONS: Readonly<Record<ErrorStatus, string>> = {
  400: 'The request body or query failed validation.',
  401: 'Authentication is missing, unusable, or rejected.',
  403: 'The authenticated principal lacks the required role.',
  404: 'No matching resource exists, or the identifier is not owned by the principal.',
  409: 'The request conflicts with the current state of the resource.',
  429: 'A rate limit was exceeded; Retry-After indicates when to retry.',
  500: 'An unexpected application failure occurred.',
  503: 'The instance is not ready to serve business requests.',
};

export function errorResponseOptions(
  status: ErrorStatus,
  description: string = DESCRIPTIONS[status],
): ApiResponseOptions {
  return { status, description, type: ErrorResponse };
}

/**
 * Documents one or more failure statuses with the shared safe error envelope.
 *
 * `@errors(400, 429, 500, 503)` keeps the failure contract of a route in one reviewable place.
 */
export function errors(...statuses: readonly ErrorStatus[]): MethodDecorator & ClassDecorator {
  return applyDecorators(...statuses.map((status) => ApiResponse(errorResponseOptions(status))));
}
