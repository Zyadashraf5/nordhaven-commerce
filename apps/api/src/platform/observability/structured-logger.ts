import type { LoggerService } from '@nestjs/common';
import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';
import type { EnvironmentConfiguration } from '../config/environment';
import { REDACT_PATHS } from './logging';

export function createStructuredLoggerOptions(
  configuration: EnvironmentConfiguration,
): LoggerOptions {
  return {
    level: configuration.logLevel,
    base: { service: 'nordhaven-api', environment: configuration.nodeEnv },
    redact: { paths: [...REDACT_PATHS], censor: '[REDACTED]' },
  };
}

export class StructuredLogger implements LoggerService {
  private readonly logger: Logger;

  public constructor(configuration: EnvironmentConfiguration, destination?: DestinationStream) {
    this.logger = pino(createStructuredLoggerOptions(configuration), destination);
  }

  public log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  public error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  public warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  public debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  public verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('trace', message, optionalParams);
  }

  public fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
    message: unknown,
    optionalParams: readonly unknown[],
  ): void {
    if (typeof message === 'object' && message !== null) {
      this.logger[level]({ ...message, context: optionalParams.at(-1) }, 'application_event');
    } else {
      this.logger[level]({ context: optionalParams.at(-1) }, String(message));
    }
  }
}
