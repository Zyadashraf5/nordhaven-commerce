import { ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { getCorrelationId } from '../observability/correlation';
import { AppError } from './app-error';

export interface SafeErrorResponse {
  statusCode: number;
  code: string;
  message: string;
  correlationId: string;
  details?: unknown;
}

/** How long a client should wait before retrying a not-ready dependency. */
const UNAVAILABLE_RETRY_AFTER_SECONDS = 5;

function codeForStatus(statusCode: number): string {
  if (statusCode === 404) return 'ROUTE_NOT_FOUND';
  if (statusCode === 503) return 'SERVICE_UNAVAILABLE';
  if (statusCode >= 500) return 'INTERNAL_ERROR';
  return 'VALIDATION_ERROR';
}

function messageForStatus(statusCode: number): string {
  if (statusCode === 404) return 'Route not found';
  if (statusCode === 503) return 'Service is not ready';
  if (statusCode >= 500) return 'Internal server error';
  return 'Request validation failed';
}

interface ProtectedErrorLogger {
  error(message: unknown): void;
}

function safeDetails(exception: unknown): unknown {
  if (!(exception instanceof HttpException)) return undefined;
  const response = exception.getResponse();
  if (typeof response !== 'object' || response === null || !('details' in response))
    return undefined;
  const details = (response as { details?: unknown }).details;
  return Array.isArray(details) || (typeof details === 'object' && details !== null)
    ? details
    : undefined;
}

/**
 * Emits the shared safe error envelope.
 *
 * Only `AppError` may contribute a code, a message, details, or a `Retry-After` value. Every other
 * exception keeps the Milestone 01 status-based mapping, so request-derived text can never reach a
 * response body.
 */
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  public constructor(
    private readonly logger: ProtectedErrorLogger = new Logger(SafeExceptionFilter.name),
  ) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();
    const appError = exception instanceof AppError ? exception : undefined;
    const statusCode = exception instanceof HttpException ? exception.getStatus() : 500;
    const details = appError === undefined ? safeDetails(exception) : safeDetails(appError);
    const body: SafeErrorResponse = {
      statusCode,
      code: appError?.code ?? codeForStatus(statusCode),
      message: appError?.safeMessage ?? messageForStatus(statusCode),
      correlationId: getCorrelationId(request),
      ...(details === undefined ? {} : { details }),
    };

    if (statusCode >= 500 && statusCode !== 503) {
      this.logger.error({
        event: 'request_failed',
        statusCode,
        correlationId: body.correlationId,
        errorType: exception instanceof Error ? exception.constructor.name : 'UnknownError',
      });
    }

    const retryAfterSeconds =
      appError?.retryAfterSeconds ??
      (statusCode === 503 ? UNAVAILABLE_RETRY_AFTER_SECONDS : undefined);
    if (retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(retryAfterSeconds));
    }

    // Authentication and error responses must never be retained by a cache.
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Correlation-ID', body.correlationId);
    response.status(statusCode).json(body);
  }
}
