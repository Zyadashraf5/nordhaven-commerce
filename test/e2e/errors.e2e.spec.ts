import { Writable } from 'node:stream';
import request from 'supertest';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { testConfiguration } from '../helpers/test-configuration';

const configuration = testConfiguration();

describe('safe HTTP errors and versioning', () => {
  it.each(['/api/v1/not-a-route', '/api/v2/health/live'])(
    'returns a correlated safe 404 for %s',
    async (route) => {
      const { app } = await createApplication({ configuration, initializeDatabase: false });
      try {
        const server = app.getHttpServer() as Parameters<typeof request>[0];
        const response = await request(server).get(route).expect(404);
        const body = response.body as { correlationId?: unknown };
        expect(response.body).toMatchObject({ statusCode: 404, code: 'ROUTE_NOT_FOUND' });
        expect(response.headers['x-correlation-id']).toBe(body.correlationId);
        expect(JSON.stringify(response.body)).not.toMatch(/stack|DATABASE_URL|postgresql:\/\//);
      } finally {
        await app.close();
      }
    },
  );

  it('propagates one valid caller correlation UUID', async () => {
    const { app } = await createApplication({ configuration, initializeDatabase: false });
    const correlationId = '8f44f65f-e86a-4fe4-9aac-07b3e6c810f7';
    try {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const response = await request(server)
        .get('/api/v1/health/live')
        .set('X-Correlation-ID', correlationId)
        .expect(200);
      expect(response.headers['x-correlation-id']).toBe(correlationId);
      expect(response.headers['cache-control']).toBe('no-store');
    } finally {
      await app.close();
    }
  });

  it('returns a safe correlated 500 and records a redacted diagnostic', async () => {
    const chunks: string[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const secret = 'synthetic-controlled-error-secret';
    const failureInterceptor = {
      intercept() {
        throw new Error(secret);
      },
    };
    const { app } = await createApplication({
      configuration: { ...configuration, logLevel: 'info' },
      initializeDatabase: false,
      logDestination: destination,
      configureBeforeInit(application) {
        application.useGlobalInterceptors(failureInterceptor);
      },
    });
    try {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      const response = await request(server).get('/api/v1/health/live').expect(500);
      const body = response.body as { correlationId: string };
      expect(body).toMatchObject({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      });
      expect(response.headers['x-correlation-id']).toBe(body.correlationId);
      const captured = chunks.join('');
      expect(captured).toContain(body.correlationId);
      expect(captured).toContain('request_failed');
      expect(captured).not.toContain(secret);
    } finally {
      await app.close();
    }
  });
});
