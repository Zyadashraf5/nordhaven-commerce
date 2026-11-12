import type { EnvironmentConfiguration } from '../config/environment';
import { DatabaseService } from './database.service';

const configuration: EnvironmentConfiguration = {
  nodeEnv: 'test',
  port: 3000,
  databaseUrl: 'postgresql://test:test@localhost:5432/nordhaven_unit_integration',
  logLevel: 'silent',
  databaseStartupTimeoutMs: 100,
  databaseProbeTimeoutMs: 50,
  shutdownTimeoutMs: 1000,
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

function createSubject() {
  const client = {
    $connect: jest.fn<Promise<void>, []>(),
    $queryRaw: jest.fn<Promise<unknown>, [TemplateStringsArray]>(),
    $disconnect: jest.fn<Promise<void>, []>(),
  };
  const service = new DatabaseService(configuration);
  Object.defineProperty(service, 'client', { value: client });
  return { client, service };
}

describe('DatabaseService', () => {
  it('owns connect, bounded probe, and close in one lifecycle', async () => {
    const { client, service } = createSubject();
    client.$connect.mockResolvedValue(undefined);
    client.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    client.$disconnect.mockResolvedValue(undefined);

    await expect(service.connectAndProbe()).resolves.toBeUndefined();
    await expect(service.probe()).resolves.toBeUndefined();
    await expect(service.close()).resolves.toBeUndefined();

    expect(client.$connect).toHaveBeenCalledTimes(1);
    expect(client.$queryRaw).toHaveBeenCalledTimes(2);
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
  });

  it('rejects a probe that exceeds its bound', async () => {
    jest.useFakeTimers();
    const { client, service } = createSubject();
    client.$queryRaw.mockReturnValue(new Promise(() => undefined));

    const assertion = expect(service.probe(25)).rejects.toThrow('Database operation timed out');
    await jest.advanceTimersByTimeAsync(25);
    await assertion;
    jest.useRealTimers();
  });

  it('normalizes a non-Error database rejection', async () => {
    const { client, service } = createSubject();
    client.$queryRaw.mockRejectedValue('connection detail');
    await expect(service.probe()).rejects.toThrow('Database operation failed');
  });

  it('closes the owned client during application shutdown', async () => {
    const { client, service } = createSubject();
    client.$disconnect.mockResolvedValue(undefined);
    await service.onApplicationShutdown();
    expect(client.$disconnect).toHaveBeenCalledTimes(1);
  });
});
