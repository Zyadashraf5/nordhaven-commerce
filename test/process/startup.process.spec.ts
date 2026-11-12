import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import net, { type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveProcessDatabaseUrl, TEST_AUTH_ENCRYPTION_KEY } from './process-environment';

function canConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

describe('initial startup policy', () => {
  it('exits non-zero before binding HTTP when PostgreSQL is unavailable', async () => {
    const port = 45871;
    const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        LOG_LEVEL: 'silent',
        DATABASE_URL: 'postgresql://test:canary@127.0.0.1:1/nordhaven_unit_e2e',
        DATABASE_STARTUP_TIMEOUT_MS: '1000',
        DATABASE_PROBE_TIMEOUT_MS: '100',
        SHUTDOWN_TIMEOUT_MS: '1000',
        AUTH_ENCRYPTION_KEY: TEST_AUTH_ENCRYPTION_KEY,
      },
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const exitCode = await new Promise<number | null>((resolve) => child.once('exit', resolve));
    expect(exitCode).not.toBe(0);
    expect(await canConnect(port)).toBe(false);
    expect(stderr).toContain('dependency_unavailable');
    expect(stderr).not.toContain('canary');
  }, 10_000);

  it('identifies invalid configuration keys without printing rejected values', async () => {
    const secret = 'synthetic-invalid-database-secret';
    const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: '3000',
        LOG_LEVEL: 'silent',
        DATABASE_URL: secret,
        DATABASE_STARTUP_TIMEOUT_MS: '1000',
        DATABASE_PROBE_TIMEOUT_MS: '100',
        SHUTDOWN_TIMEOUT_MS: '1000',
        AUTH_ENCRYPTION_KEY: TEST_AUTH_ENCRYPTION_KEY,
      },
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const exitCode = await new Promise<number | null>((resolve) => child.once('exit', resolve));
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('configuration_invalid');
    expect(stderr).toContain('DATABASE_URL');
    expect(stderr).not.toContain(secret);
  }, 10_000);

  it('loads the documented local .env file before validating configuration', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'nordhaven-env-'));
    const secret = 'synthetic-local-env-secret';
    await writeFile(
      path.join(directory, '.env'),
      [
        'NODE_ENV=test',
        'PORT=45873',
        'LOG_LEVEL=silent',
        `DATABASE_URL=postgresql://test:${secret}@127.0.0.1:1/nordhaven_unit_e2e`,
        'DATABASE_STARTUP_TIMEOUT_MS=1000',
        'DATABASE_PROBE_TIMEOUT_MS=100',
        'SHUTDOWN_TIMEOUT_MS=1000',
        `AUTH_ENCRYPTION_KEY=${TEST_AUTH_ENCRYPTION_KEY}`,
      ].join('\n'),
      'utf8',
    );
    const environment = { ...process.env };
    for (const key of [
      'NODE_ENV',
      'PORT',
      'LOG_LEVEL',
      'DATABASE_URL',
      'DATABASE_STARTUP_TIMEOUT_MS',
      'DATABASE_PROBE_TIMEOUT_MS',
      'SHUTDOWN_TIMEOUT_MS',
      'AUTH_ENCRYPTION_KEY',
    ]) {
      delete environment[key];
    }
    const child = spawn(process.execPath, [path.resolve('apps/api/dist/main.js')], {
      cwd: directory,
      env: environment,
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    try {
      const exitCode = await new Promise<number | null>((resolve) => child.once('exit', resolve));
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('dependency_unavailable');
      expect(stderr).not.toContain(secret);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 10_000);

  it('identifies a port conflict without printing database credentials', async () => {
    const listener = net.createServer();
    // Occupy the same IPv4 all-interfaces address the application binds (main.ts listens
    // on 0.0.0.0). A loopback-only or IPv6-only listener would not conflict on Windows,
    // where overlapping binds across addresses/families are permitted.
    await new Promise<void>((resolve, reject) => {
      listener.once('error', reject);
      listener.listen(0, '0.0.0.0', resolve);
    });
    const port = (listener.address() as AddressInfo).port;
    const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        LOG_LEVEL: 'silent',
        DATABASE_URL: resolveProcessDatabaseUrl(),
        DATABASE_STARTUP_TIMEOUT_MS: '5000',
        DATABASE_PROBE_TIMEOUT_MS: '1000',
        SHUTDOWN_TIMEOUT_MS: '1000',
        AUTH_ENCRYPTION_KEY: TEST_AUTH_ENCRYPTION_KEY,
      },
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    try {
      const exitCode = await new Promise<number | null>((resolve) => child.once('exit', resolve));
      expect(exitCode).not.toBe(0);
      expect(stderr).toContain('port_unavailable');
      expect(stderr).toContain(String(port));
      expect(stderr).not.toContain('postgresql://');
    } finally {
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await new Promise<void>((resolve) => listener.close(() => resolve()));
    }
  }, 15_000);
});
