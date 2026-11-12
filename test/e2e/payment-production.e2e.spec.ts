import request from 'supertest';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { resetPaymentDatabase } from '../helpers/payment-database';
import { testConfigurationFor } from '../helpers/test-configuration';
type Application = Awaited<ReturnType<typeof createApplication>>['app'];
describe('production-mode financial refusal on an isolated E2E database', () => {
  let app: Application;
  let database: DatabaseService;
  beforeAll(async () => {
    const isolated = testConfigurationFor('e2e');
    ({ app } = await createApplication({ configuration: { ...isolated, nodeEnv: 'production' } }));
    database = app.get(DatabaseService);
    await resetPaymentDatabase(database);
    await resetIdentityDatabase(database);
  }, 30_000);
  afterAll(async () => {
    await resetPaymentDatabase(database);
    await resetIdentityDatabase(database);
    await app.close();
  });
  it('refuses an authenticated attempt before creating a payment or querying an order', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const credentials = {
      email: 'production-refusal@nordhaven.test',
      password: 'Synthetic-Production-Refusal-Password',
    };
    await request(server).post('/api/v1/auth/register').send(credentials).expect(201);
    const session = await request(server).post('/api/v1/auth/login').send(credentials).expect(200);
    const token = (session.body as { session: { token: string } }).session.token;
    const response = await request(server)
      .post('/api/v1/payments/attempts')
      .set('Authorization', 'Bearer ' + token)
      .set('Idempotency-Key', 'production-refusal')
      .send({ orderId: '11111111-1111-4111-8111-111111111111' })
      .expect(503);
    expect((response.body as { code: string }).code).toBe('SERVICE_UNAVAILABLE');
    expect(await database.prisma.paymentAttempt.count()).toBe(0);
  });
  it('refuses public webhook processing without applying financial state', async () => {
    const server = app.getHttpServer() as Parameters<typeof request>[0];
    const response = await request(server)
      .post('/api/v1/payments/webhooks/LOCAL_TEST')
      .send({ reference: 'disabled' })
      .expect(401);
    expect((response.body as { code: string }).code).toBe('PAYMENT_EVENT_UNVERIFIED');
    expect(await database.prisma.paymentAttempt.count()).toBe(0);
    expect(await database.prisma.refund.count()).toBe(0);
  });
});
