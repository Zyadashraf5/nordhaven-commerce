import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  type ArgumentsHost,
} from '@nestjs/common';
import { AppError } from './app-error';
import { SafeExceptionFilter, type SafeErrorResponse } from './safe-exception.filter';

interface ResponseStub {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  setHeader(name: string, value: string): void;
  status(code: number): ResponseStub;
  json(body: unknown): ResponseStub;
}

function createResponse(): ResponseStub {
  const response: ResponseStub = {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      response.headers[name] = value;
    },
    status(code) {
      response.statusCode = code;
      return response;
    },
    json(body) {
      response.body = body;
      return response;
    },
  };
  return response;
}

function createHost(request: object, response: ResponseStub): ArgumentsHost {
  return {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ArgumentsHost;
}

function apply(exception: unknown): { response: ResponseStub; body: SafeErrorResponse } {
  const response = createResponse();
  const filter = new SafeExceptionFilter({ error: jest.fn() });
  filter.catch(exception, createHost({ headers: {} }, response));
  return { response, body: response.body as SafeErrorResponse };
}

describe('SafeExceptionFilter', () => {
  it('emits the declared code, message, and retry hint for a rate limit', () => {
    const { response, body } = apply(AppError.rateLimited(42));

    expect(response.statusCode).toBe(429);
    expect(body).toMatchObject({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests',
    });
    expect(response.headers['Retry-After']).toBe('42');
  });

  it.each([
    [AppError.unauthenticated(), 401, 'UNAUTHENTICATED'],
    [AppError.invalidCredentials(), 401, 'INVALID_CREDENTIALS'],
    [AppError.invalidChallenge(), 401, 'INVALID_CHALLENGE'],
    [AppError.invalidMfaCode(), 401, 'INVALID_MFA_CODE'],
    [AppError.invalidRecoveryToken(), 400, 'INVALID_RECOVERY_TOKEN'],
    [AppError.forbidden(), 403, 'FORBIDDEN'],
    [AppError.sessionNotFound(), 404, 'SESSION_NOT_FOUND'],
    [AppError.registrationNotAllowed(), 409, 'REGISTRATION_NOT_ALLOWED'],
    [AppError.mfaAlreadyEnrolled(), 409, 'MFA_ALREADY_ENROLLED'],
  ])('maps %p to a stable envelope', (error, statusCode, code) => {
    const { response, body } = apply(error);
    expect(response.statusCode).toBe(statusCode);
    expect(body.code).toBe(code);
    expect(body.message.length).toBeGreaterThan(0);
  });

  it('preserves boundary validation details without repeating the status mapping', () => {
    const { response, body } = apply(
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'password', message: 'Invalid value' }],
      }),
    );

    expect(response.statusCode).toBe(400);
    expect(body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(body.details).toEqual([{ path: 'password', message: 'Invalid value' }]);
    expect(body.message).toBe('Request validation failed');
  });

  it('maps an unmatched route and a not-ready dependency to their documented codes', () => {
    expect(apply(new NotFoundException()).body.code).toBe('ROUTE_NOT_FOUND');

    const unavailable = apply(new ServiceUnavailableException());
    expect(unavailable.body).toMatchObject({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
    expect(unavailable.response.headers['Retry-After']).toBe('5');
  });

  it('never echoes the text of an unclassified failure and records it once', () => {
    const canary = 'synthetic-filter-canary-9f2c';
    const error = jest.fn();
    const response = createResponse();
    const filter = new SafeExceptionFilter({ error });

    filter.catch(new Error(canary), createHost({ headers: {} }, response));

    const body = response.body as SafeErrorResponse;
    expect(response.statusCode).toBe(500);
    expect(body).toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(JSON.stringify(body)).not.toContain(canary);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('marks every response uncacheable and correlated', () => {
    const { response, body } = apply(AppError.unauthenticated());

    expect(response.headers['Cache-Control']).toBe('no-store');
    expect(response.headers['X-Correlation-ID']).toBe(body.correlationId);
    expect(body.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('does not attach a retry hint to a client error', () => {
    const { response } = apply(AppError.invalidCredentials());
    expect(response.headers['Retry-After']).toBeUndefined();
  });
});
