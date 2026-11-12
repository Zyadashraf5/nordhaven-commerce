import type { INestApplication } from '@nestjs/common';
import { ApplicationAvailabilityService } from '../platform/availability/application-availability.service';
import type { EnvironmentConfiguration } from '../platform/config/environment';

interface ProcessControl {
  stderr: Pick<NodeJS.WriteStream, 'write'>;
  exit(code: number): never;
  exitCode: string | number | null | undefined;
}

export async function closeGracefully(
  app: INestApplication,
  configuration: EnvironmentConfiguration,
  signal: NodeJS.Signals,
  processControl: ProcessControl = process,
): Promise<void> {
  app.get(ApplicationAvailabilityService).beginShutdown();
  const timer = setTimeout(() => {
    processControl.stderr.write(
      `${JSON.stringify({ level: 'error', event: 'shutdown_timeout', signal })}\n`,
    );
    processControl.exit(1);
  }, configuration.shutdownTimeoutMs);
  timer.unref();
  try {
    await app.close();
    clearTimeout(timer);
    processControl.exitCode = 0;
  } catch {
    clearTimeout(timer);
    processControl.exitCode = 1;
  }
}

export function installGracefulShutdown(
  app: INestApplication,
  configuration: EnvironmentConfiguration,
): void {
  let closing = false;
  const close = async (signal: NodeJS.Signals): Promise<void> => {
    if (closing) return;
    closing = true;
    await closeGracefully(app, configuration, signal);
  };

  process.once('SIGINT', () => void close('SIGINT'));
  process.once('SIGTERM', () => void close('SIGTERM'));
}
