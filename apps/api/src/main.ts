import 'reflect-metadata';
import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { createApplication } from './bootstrap/create-application';
import { installGracefulShutdown } from './bootstrap/graceful-shutdown';
import { toStartupDiagnostic } from './bootstrap/startup-diagnostics';

async function bootstrap(): Promise<void> {
  let application: INestApplication | undefined;
  try {
    const { app, configuration } = await createApplication();
    application = app;
    installGracefulShutdown(app, configuration);
    await app.listen(configuration.port, '0.0.0.0');
  } catch (error: unknown) {
    await application?.close().catch(() => undefined);
    throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify(toStartupDiagnostic(error))}\n`);
  process.exitCode = 1;
});
