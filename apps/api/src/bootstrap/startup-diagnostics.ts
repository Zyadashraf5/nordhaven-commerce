import { EnvironmentValidationError } from '../platform/config/environment';

export class StartupDependencyError extends Error {
  public constructor(
    public readonly dependency: 'database',
    public override readonly cause: unknown,
  ) {
    super('A critical startup dependency is unavailable');
    this.name = 'StartupDependencyError';
  }
}

interface ErrorWithCode {
  code?: unknown;
  port?: unknown;
}

export type StartupDiagnostic =
  | {
      level: 'error';
      event: 'startup_failed';
      category: 'configuration_invalid';
      message: 'Application configuration is invalid';
      invalidKeys: readonly string[];
    }
  | {
      level: 'error';
      event: 'startup_failed';
      category: 'port_unavailable';
      message: 'The configured HTTP port is unavailable';
      port?: number;
    }
  | {
      level: 'error';
      event: 'startup_failed';
      category: 'dependency_unavailable';
      message: 'A critical startup dependency is unavailable';
      dependency: 'database';
    }
  | {
      level: 'error';
      event: 'startup_failed';
      category: 'application_initialization_failed';
      message: 'Application startup failed';
    };

export function toStartupDiagnostic(error: unknown): StartupDiagnostic {
  if (error instanceof EnvironmentValidationError) {
    return {
      level: 'error',
      event: 'startup_failed',
      category: 'configuration_invalid',
      message: 'Application configuration is invalid',
      invalidKeys: error.invalidKeys,
    };
  }
  if (error instanceof StartupDependencyError) {
    return {
      level: 'error',
      event: 'startup_failed',
      category: 'dependency_unavailable',
      message: 'A critical startup dependency is unavailable',
      dependency: error.dependency,
    };
  }
  if (typeof error === 'object' && error !== null) {
    const candidate = error as ErrorWithCode;
    if (candidate.code === 'EADDRINUSE') {
      const port = typeof candidate.port === 'number' ? candidate.port : undefined;
      return {
        level: 'error',
        event: 'startup_failed',
        category: 'port_unavailable',
        message: 'The configured HTTP port is unavailable',
        ...(port === undefined ? {} : { port }),
      };
    }
  }
  return {
    level: 'error',
    event: 'startup_failed',
    category: 'application_initialization_failed',
    message: 'Application startup failed',
  };
}
