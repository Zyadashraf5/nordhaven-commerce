import type { INestApplication } from '@nestjs/common';
import { ApplicationAvailabilityService } from '../platform/availability/application-availability.service';
import type { EnvironmentConfiguration } from '../platform/config/environment';
import { closeGracefully } from './graceful-shutdown';

const configuration: EnvironmentConfiguration = {
  nodeEnv: 'test',
  port: 3000,
  databaseUrl: 'postgresql://test:test@localhost:5432/nordhaven_unit_e2e',
  logLevel: 'silent',
  databaseStartupTimeoutMs: 5000,
  databaseProbeTimeoutMs: 1000,
  shutdownTimeoutMs: 8000,
  authEncryptionKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  authSessionAbsoluteTtlSeconds: 3600,
  authSessionIdleTtlSeconds: 1800,
  authMaxFailedAttempts: 10,
  authLockoutSeconds: 900,
  authPasswordResetTtlSeconds: 1800,
  authMfaIssuer: 'Nordhaven Commerce',
  authNotificationTransport: 'memory',
  customerNotificationTransport: 'memory',
};

describe('closeGracefully', () => {
  it('rejects readiness before draining and reports an orderly close', async () => {
    const availability = new ApplicationAvailabilityService();
    availability.markReady();
    const close = jest.fn(() => {
      expect(availability.getState()).toBe('SHUTTING_DOWN');
      return Promise.resolve();
    });
    const app = {
      get: jest.fn((token: unknown) => {
        expect(token).toBe(ApplicationAvailabilityService);
        return availability;
      }),
      close,
    } as unknown as INestApplication;
    const processControl = {
      stderr: { write: jest.fn(() => true) },
      exit: jest.fn(() => {
        throw new Error('unexpected forced exit');
      }) as never,
      exitCode: undefined as number | undefined,
    };

    await closeGracefully(app, configuration, 'SIGTERM', processControl);

    expect(close).toHaveBeenCalledTimes(1);
    expect(processControl.exitCode).toBe(0);
  });

  it('forces a failing exit when the drain exceeds its configured bound', async () => {
    jest.useFakeTimers();
    const availability = new ApplicationAvailabilityService();
    const app = {
      get: jest.fn(() => availability),
      close: jest.fn(() => new Promise<void>(() => undefined)),
    } as unknown as INestApplication;
    const exit = jest.fn((): never => undefined as never);
    const processControl = {
      stderr: { write: jest.fn(() => true) },
      exit,
      exitCode: undefined as number | undefined,
    };

    void closeGracefully(
      app,
      { ...configuration, shutdownTimeoutMs: 1000 },
      'SIGTERM',
      processControl,
    );
    await jest.advanceTimersByTimeAsync(1000);

    expect(exit).toHaveBeenCalledWith(1);
    expect(processControl.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('shutdown_timeout'),
    );
    jest.useRealTimers();
  });
});
