import request from 'supertest';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { testConfiguration } from '../helpers/test-configuration';

const configuration = testConfiguration();

describe('health API', () => {
  it('keeps liveness healthy while readiness degrades and recovers', async () => {
    const { app } = await createApplication({ configuration, initializeDatabase: false });
    const probe = jest.spyOn(app.get(DatabaseService), 'probe');
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    try {
      probe.mockResolvedValueOnce(undefined);
      await request(server)
        .get('/api/v1/health/ready')
        .expect(200)
        .expect({ status: 'ok', checks: { database: 'up' } });

      probe.mockRejectedValueOnce(new Error('canary database secret'));
      const unavailable = await request(server).get('/api/v1/health/ready').expect(503);
      expect(unavailable.body).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
      expect(JSON.stringify(unavailable.body)).not.toContain('canary database secret');
      await request(server).get('/api/v1/health/live').expect(200);

      probe.mockResolvedValueOnce(undefined);
      await request(server).get('/api/v1/health/ready').expect(200);
    } finally {
      await app.close();
    }
  });
});
