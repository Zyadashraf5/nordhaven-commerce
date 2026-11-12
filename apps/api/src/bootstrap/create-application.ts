import { VersioningType, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../app.module';
import { ApplicationAvailabilityService } from '../platform/availability/application-availability.service';
import { loadEnvironment, type EnvironmentConfiguration } from '../platform/config/environment';
import { DatabaseService } from '../platform/database/database.service';
import { SafeExceptionFilter } from '../platform/http/safe-exception.filter';
import { createHttpLogger } from '../platform/observability/logging';
import { StructuredLogger } from '../platform/observability/structured-logger';
import { configureOpenApi, createOpenApiDocument } from '../platform/openapi/openapi';
import { ZodValidationPipe } from '../platform/validation/zod-validation.pipe';
import type { DestinationStream } from 'pino';
import { StartupDependencyError } from './startup-diagnostics';

export interface CreateApplicationOptions {
  configuration?: EnvironmentConfiguration;
  initializeDatabase?: boolean;
  logDestination?: DestinationStream;
  configureBeforeInit?: (app: INestApplication) => void | Promise<void>;
}

export interface CreatedApplication {
  app: INestApplication;
  configuration: EnvironmentConfiguration;
}

export async function createApplication(
  options: CreateApplicationOptions = {},
): Promise<CreatedApplication> {
  const configuration = options.configuration ?? loadEnvironment();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(configuration), {
    bufferLogs: true,
    rawBody: true,
  });
  app.useLogger(new StructuredLogger(configuration, options.logDestination));
  app.flushLogs();
  app.use(createHttpLogger(configuration, options.logDestination));
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalFilters(new SafeExceptionFilter());
  app.useGlobalPipes(new ZodValidationPipe());
  await options.configureBeforeInit?.(app);

  const openApiDocument = createOpenApiDocument(app);
  configureOpenApi(app, openApiDocument);
  await app.init();

  if (options.initializeDatabase !== false) {
    try {
      await app.get(DatabaseService).connectAndProbe();
      app.get(ApplicationAvailabilityService).markReady();
    } catch (error: unknown) {
      await app.close();
      throw new StartupDependencyError('database', error);
    }
  }

  return { app, configuration };
}
