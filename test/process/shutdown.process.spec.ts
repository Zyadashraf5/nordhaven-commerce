import { spawn } from 'node:child_process';
import http from 'node:http';
import { resolveProcessDatabaseUrl, TEST_AUTH_ENCRYPTION_KEY } from './process-environment';

function waitForLive(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 8000;
    const attempt = (): void => {
      http
        .get(`http://127.0.0.1:${port}/api/v1/health/live`, (response) => {
          response.resume();
          if (response.statusCode === 200) resolve();
          else retry();
        })
        .on('error', retry);
    };
    const retry = (): void => {
      if (Date.now() >= deadline) reject(new Error('Application did not become live'));
      else setTimeout(attempt, 100);
    };
    attempt();
  });
}

function requestStatus(port: number): Promise<number | 'refused'> {
  return new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${port}/api/v1/health/live`, (response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
    request.setTimeout(1000, () => {
      request.destroy();
      resolve('refused');
    });
    request.on('error', () => resolve('refused'));
  });
}

// `child.kill('SIGTERM')` is an unconditional TerminateProcess on Windows, so the POSIX
// signal-driven graceful path cannot be exercised there. Linux CI runs this case; the
// graceful-shutdown unit suite covers the close sequence on every platform.
const itSignal = process.platform === 'win32' ? it.skip : it;

describe('graceful shutdown', () => {
  itSignal(
    'closes within the configured bound after SIGTERM',
    async () => {
      const port = 45872;
      const child = spawn(process.execPath, ['apps/api/dist/main.js'], {
        env: {
          ...process.env,
          NODE_ENV: 'test',
          PORT: String(port),
          LOG_LEVEL: 'silent',
          DATABASE_URL: resolveProcessDatabaseUrl(),
          DATABASE_STARTUP_TIMEOUT_MS: '5000',
          DATABASE_PROBE_TIMEOUT_MS: '1000',
          SHUTDOWN_TIMEOUT_MS: '8000',
          AUTH_ENCRYPTION_KEY: TEST_AUTH_ENCRYPTION_KEY,
        },
      });
      await waitForLive(port);
      const started = Date.now();
      const exitPromise = new Promise<number | null>((resolve) => child.once('exit', resolve));
      child.kill('SIGTERM');
      let postSignalStatus: number | 'refused' = 200;
      const refusalDeadline = Date.now() + 3000;
      while (postSignalStatus === 200 && Date.now() < refusalDeadline) {
        postSignalStatus = await requestStatus(port);
      }
      const exitCode = await exitPromise;
      expect(exitCode).toBe(0);
      expect(postSignalStatus).not.toBe(200);
      expect(Date.now() - started).toBeLessThan(10_000);
    },
    20_000,
  );
});
