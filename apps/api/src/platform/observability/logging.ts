import pinoHttp from 'pino-http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import type { DestinationStream } from 'pino';
import type { EnvironmentConfiguration } from '../config/environment';
import { assignCorrelationId, getCorrelationId } from './correlation';

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'password',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'token',
  'challengeToken',
  'sessionToken',
  'tokenHash',
  'recoveryCode',
  'recoveryCodes',
  'secret',
  'secretCiphertext',
  'otpauthUri',
  'databaseUrl',
  'DATABASE_URL',
  'authEncryptionKey',
  'AUTH_ENCRYPTION_KEY',
  // Customer profile and saved-address personal attributes. The capability deliberately logs only
  // non-sensitive identifiers, so these paths are defence in depth against an accidental log.
  'displayName',
  'recipientName',
  'line1',
  'line2',
  'city',
  'region',
  'postalCode',
  'countryCode',
  'phone',
  // Security-event detail is a nested object; redact the sensitive names one level down too.
  'detail.password',
  'detail.token',
  'detail.secret',
  'detail.code',
  'detail.recoveryCode',
] as const;

export function createHttpLogger(
  configuration: EnvironmentConfiguration,
  destination?: DestinationStream,
) {
  const options: Options<IncomingMessage, ServerResponse> = {
    level: configuration.logLevel,
    redact: { paths: [...REDACT_PATHS], censor: '[REDACTED]' },
    genReqId(request, response) {
      const correlationId = assignCorrelationId(request);
      response.setHeader('X-Correlation-ID', correlationId);
      return correlationId;
    },
    customProps(request) {
      return {
        service: 'nordhaven-api',
        environment: configuration.nodeEnv,
        correlationId: getCorrelationId(request),
      };
    },
    serializers: {
      req(request: unknown) {
        if (typeof request !== 'object' || request === null) return {};
        const fields = request as Record<string, unknown>;
        return {
          id:
            typeof fields.id === 'string' || typeof fields.id === 'number' ? fields.id : undefined,
          method: typeof fields.method === 'string' ? fields.method : undefined,
          url: typeof fields.url === 'string' ? fields.url.split('?')[0] : undefined,
        };
      },
    },
  };
  return pinoHttp(options, destination);
}
