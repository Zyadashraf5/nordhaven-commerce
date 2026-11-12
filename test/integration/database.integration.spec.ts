import { spawnSync } from 'node:child_process';
import net, { type AddressInfo, type Socket } from 'node:net';
import pg from 'pg';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { assertSafeTestDatabase } from '../helpers/database-guard';
import { testConfiguration } from '../helpers/test-configuration';

class ToggleableTcpProxy {
  private server: net.Server | undefined;
  private readonly sockets = new Set<Socket>();

  public constructor(
    private readonly targetHost: string,
    private readonly targetPort: number,
  ) {}

  public async start(port = 0): Promise<number> {
    this.server = net.createServer((client) => {
      const upstream = net.createConnection({ host: this.targetHost, port: this.targetPort });
      this.sockets.add(client);
      this.sockets.add(upstream);
      client.pipe(upstream).pipe(client);
      const cleanup = (): void => {
        this.sockets.delete(client);
        this.sockets.delete(upstream);
        client.destroy();
        upstream.destroy();
      };
      client.once('error', cleanup);
      upstream.once('error', cleanup);
      client.once('close', cleanup);
      upstream.once('close', cleanup);
    });
    await new Promise<void>((resolve, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(port, '127.0.0.1', resolve);
    });
    return (this.server.address() as AddressInfo).port;
  }

  public async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    const server = this.server;
    this.server = undefined;
    if (server === undefined) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe('PostgreSQL and Prisma integration', () => {
  const databaseUrl = process.env.DATABASE_URL;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    assertSafeTestDatabase(databaseUrl, 'integration');
  });

  it('deploys reviewed migrations repeatedly and performs a real bounded probe', async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const deployment = spawnSync('corepack', ['pnpm@12.13.0', 'prisma:migrate:deploy'], {
        env: { ...process.env, DATABASE_URL: databaseUrl },
        encoding: 'utf8',
        shell: process.platform === 'win32',
      });
      expect(deployment.status).toBe(0);
    }
    const status = spawnSync('corepack', ['pnpm@12.13.0', 'prisma:migrate:status'], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: 'utf8',
      shell: process.platform === 'win32',
    });
    expect(status.status).toBe(0);
    expect(`${status.stdout}\n${status.stderr}`).toMatch(
      /up to date|Database schema is up to date/i,
    );
    const { app } = await createApplication({
      configuration: testConfiguration({ databaseUrl: databaseUrl! }),
      initializeDatabase: false,
    });
    try {
      const database = app.get(DatabaseService);
      await database.connectAndProbe();
      await expect(database.probe()).resolves.toBeUndefined();
    } finally {
      await app.close();
    }
  }, 30_000);

  it('detects a real transport outage and recovers without recreating the service', async () => {
    const target = new URL(databaseUrl!);
    const proxy = new ToggleableTcpProxy(target.hostname, Number(target.port || 5432));
    const proxyPort = await proxy.start();
    const proxiedUrl = new URL(databaseUrl!);
    proxiedUrl.hostname = '127.0.0.1';
    proxiedUrl.port = String(proxyPort);
    const service = new DatabaseService(
      testConfiguration({ databaseUrl: proxiedUrl.toString(), databaseProbeTimeoutMs: 500 }),
    );
    try {
      await service.connectAndProbe();
      await proxy.stop();
      await expect(service.probe(500)).rejects.toThrow();
      await proxy.start(proxyPort);
      await expect(service.probe(2000)).resolves.toBeUndefined();
    } finally {
      await service.close().catch(() => undefined);
      await proxy.stop();
    }
  }, 30_000);

  it('keeps temporary integration state isolated to its owning session', async () => {
    const first = new pg.Client({ connectionString: databaseUrl });
    await first.connect();
    await first.query('CREATE TEMP TABLE milestone_01_isolation_canary (value integer NOT NULL)');
    await first.query('INSERT INTO milestone_01_isolation_canary (value) VALUES (1)');
    await first.end();

    const second = new pg.Client({ connectionString: databaseUrl });
    await second.connect();
    try {
      const result = await second.query<{ relation: string | null }>(
        "SELECT to_regclass('pg_temp.milestone_01_isolation_canary')::text AS relation",
      );
      expect(result.rows[0]?.relation).toBeNull();
    } finally {
      await second.end();
    }
  });
});
