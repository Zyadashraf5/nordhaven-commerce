import { UserRepository } from '../../apps/api/src/modules/identity/persistence/user.repository';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { InventoryService } from '../../apps/api/src/modules/inventory/application/inventory.service';
import { InventoryRepository } from '../../apps/api/src/modules/inventory/persistence/inventory.repository';
import { ReservationService } from '../../apps/api/src/modules/inventory/application/reservation.service';
import { ReservationRepository } from '../../apps/api/src/modules/inventory/persistence/reservation.repository';
import { BundleService } from '../../apps/api/src/modules/inventory/application/bundle.service';
import { IdentityService } from '../../apps/api/src/modules/identity/application/identity.service';
import { SessionService } from '../../apps/api/src/modules/identity/application/session.service';
import { PasswordResetService } from '../../apps/api/src/modules/identity/application/password-reset.service';
import { IdentityTokenRepository } from '../../apps/api/src/modules/identity/persistence/identity-token.repository';
import { MfaService } from '../../apps/api/src/modules/identity/application/mfa.service';
import { MfaRepository } from '../../apps/api/src/modules/identity/persistence/mfa.repository';
import { hashPassword } from '../../apps/api/src/modules/identity/crypto/password-hasher';
import { hashToken } from '../../apps/api/src/modules/identity/crypto/token';
import { SecretCipher } from '../../apps/api/src/modules/identity/crypto/secret-cipher';
import {
  generateSharedSecret,
  generateTotpCode,
  timeStepFor,
} from '../../apps/api/src/modules/identity/crypto/totp';
import type { Prisma } from '../../apps/api/src/generated/prisma/client';
import { resetInventoryDatabase } from '../helpers/inventory-database';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { testConfigurationFor, TEST_AUTH_ENCRYPTION_KEY } from '../helpers/test-configuration';

function gate() {
  let open: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { promise, open };
}
type Application = Awaited<ReturnType<typeof createApplication>>['app'];
const correlationId = '9f6b6a1e-6a5c-4a6c-9a6f-3f2c1d0b8a71';
const password = 'Audit-Regression-Passphrase-123!';

describe('independent audit regression invariants', () => {
  let app: Application;
  let database: DatabaseService;
  let inventory: InventoryService;
  let reservations: ReservationService;
  let rr: ReservationRepository;
  beforeAll(async () => {
    ({ app } = await createApplication({ configuration: testConfigurationFor('integration') }));
    database = app.get(DatabaseService);
    inventory = app.get(InventoryService);
    reservations = app.get(ReservationService);
    rr = app.get(ReservationRepository);
  }, 30_000);
  beforeEach(async () => {
    await resetInventoryDatabase(database);
    await resetIdentityDatabase(database);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await resetInventoryDatabase(database);
    await resetIdentityDatabase(database);
  });
  afterAll(async () => {
    await app.close();
  });

  async function product() {
    const key = randomUUID();
    const category = await database.prisma.category.create({ data: { name: key, slug: key } });
    const brand = await database.prisma.brand.create({ data: { name: key, slug: key } });
    return database.prisma.product.create({
      data: {
        name: key,
        slug: key,
        description: 'Regression fixture',
        categoryId: category.id,
        brandId: brand.id,
        basePriceMinor: 100,
        baseCurrency: 'GBP',
        // No discount, so the effective price is the base price.
        discountBasisPoints: 0,
        effectivePriceMinor: 100,
      },
    });
  }
  async function sku(onHand = 10) {
    const parent = await product();
    const variant = await database.prisma.productVariant.create({
      data: { productId: parent.id, sku: randomUUID() },
    });
    const item = await inventory.setOnHand(variant.id, onHand, null);
    return { variant, item };
  }
  async function customer() {
    return app
      .get(IdentityService)
      .register({ email: `${randomUUID()}@example.test`, password, correlationId });
  }
  async function token(
    userId: string,
    purpose: 'PASSWORD_RESET' | 'MFA_VERIFICATION' = 'PASSWORD_RESET',
  ) {
    const value = randomUUID();
    await app.get(IdentityTokenRepository).create({
      userId,
      purpose,
      tokenHash: hashToken(value),
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    return value;
  }

  it('H02: concurrent stock sets retain an exact movement ledger', async () => {
    const { variant, item } = await sku();
    const repository = app.get(InventoryRepository),
      original = repository.setOnHand.bind(repository);
    const ready = gate();
    let pending = 0;
    jest.spyOn(repository, 'setOnHand').mockImplementation(async (...args) => {
      if (++pending === 8) ready.open();
      await ready.promise;
      return original(...args);
    });
    await Promise.all(
      Array.from({ length: 8 }, (_, i) => inventory.setOnHand(variant.id, 20 + i, null)),
    );
    const final = await database.prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    const movements = await database.prisma.stockMovement.findMany({
      where: { inventoryId: item.id },
    });
    expect(movements.reduce((sum, movement) => sum + movement.onHandDelta, 0)).toBe(final.onHand);
    expect(movements).toHaveLength(9);
  });

  it('H02: a stock set racing a reservation preserves available stock and returns business conflicts', async () => {
    const { variant, item } = await sku(5);
    const results = await Promise.allSettled([
      inventory.setOnHand(variant.id, 1, null),
      reservations.create({
        idempotencyKey: randomUUID(),
        lines: [{ sku: variant.sku, quantity: 4 }],
      }),
    ]);
    for (const result of results)
      if (result.status === 'rejected')
        expect(result.reason).toMatchObject({ code: 'INVENTORY_CONFLICT' });
    const final = await database.prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });
    expect(final.onHand).toBeGreaterThanOrEqual(final.reserved);
  });

  it('H03: expiry rechecks candidate timestamps at its conditional claim', async () => {
    const { variant, item } = await sku();
    const hold = await reservations.create({
      idempotencyKey: randomUUID(),
      lines: [{ sku: variant.sku, quantity: 2 }],
    });
    await database.prisma.reservation.update({
      where: { id: hold.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const selected = gate(),
      resume = gate();
    const find = database.prisma.reservation.findMany.bind(database.prisma.reservation);
    jest.spyOn(database.prisma.reservation, 'findMany').mockImplementation((args) => {
      const paused = (async () => {
        const rows = await find(args);
        selected.open();
        await resume.promise;
        return rows;
      })();
      return paused as Prisma.PrismaPromise<Awaited<ReturnType<typeof find>>>;
    });
    const expiring = rr.expireLapsed(new Date());
    try {
      await selected.promise;
      await database.prisma.reservation.update({
        where: { id: hold.id },
        data: { expiresAt: new Date(Date.now() + 60_000) },
      });
      resume.open();
      await expiring;
      expect(
        (await database.prisma.reservation.findUniqueOrThrow({ where: { id: hold.id } })).status,
      ).toBe('ACTIVE');
      expect(
        (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
          .reserved,
      ).toBe(2);
    } finally {
      resume.open();
    }
  });

  it('H03: concurrent extensions add both durations and a late extension is rejected', async () => {
    const { variant } = await sku();
    const hold = await reservations.create({
      idempotencyKey: randomUUID(),
      lines: [{ sku: variant.sku, quantity: 1 }],
    });
    await Promise.all([reservations.extend(hold.id, 60), reservations.extend(hold.id, 90)]);
    const extended = await database.prisma.reservation.findUniqueOrThrow({
      where: { id: hold.id },
    });
    expect(extended.expiresAt.getTime() - hold.expiresAt.getTime()).toBe(150_000);
    await database.prisma.reservation.update({
      where: { id: hold.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expect(rr.extend(hold.id, 60)).rejects.toMatchObject({ code: 'INVENTORY_CONFLICT' });
  });

  it('M02: a competing release makes confirmation fail, not return success in another state', async () => {
    const { variant } = await sku();
    const hold = await reservations.create({
      idempotencyKey: randomUUID(),
      lines: [{ sku: variant.sku, quantity: 1 }],
    });
    const selected = gate(),
      resume = gate(),
      find = rr.findById.bind(rr);
    let first = true;
    jest.spyOn(rr, 'findById').mockImplementation(async (id) => {
      const found = await find(id);
      if (first) {
        first = false;
        selected.open();
        await resume.promise;
      }
      return found;
    });
    const observed = reservations.confirm(hold.id).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    try {
      await selected.promise;
      await reservations.release(hold.id);
      resume.open();
      expect(await observed).toMatchObject({ error: { code: 'INVENTORY_CONFLICT' } });
    } finally {
      resume.open();
    }
  });

  it('H01: an old-password sign-in cannot insert a usable session after reset completes', async () => {
    const user = await customer(),
      identity = app.get(IdentityService),
      sessions = app.get(SessionService);
    const started = gate(),
      resume = gate(),
      issue = sessions.issue.bind(sessions);
    jest.spyOn(sessions, 'issue').mockImplementation(async (...args) => {
      started.open();
      await resume.promise;
      return issue(...args);
    });
    const signing = identity
      .signIn({ email: user.email, password, clientLabel: null, correlationId })
      .then(
        (value) => ({ value }),
        (error: unknown) => ({ error }),
      );
    try {
      await started.promise;
      await app.get(PasswordResetService).completeReset({
        token: await token(user.id),
        newPassword: 'Replacement-Audit-Passphrase-456!',
        correlationId,
      });
      resume.open();
      expect(await signing).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } });
      expect(
        await database.prisma.session.count({ where: { userId: user.id, revokedAt: null } }),
      ).toBe(0);
    } finally {
      resume.open();
    }
  });

  it('H01: a legitimate password change preserves only the current session at the new generation', async () => {
    const user = await customer(),
      sessions = app.get(SessionService),
      identity = app.get(IdentityService);
    const current = await sessions.issue(user.id, null, new Date()),
      other = await sessions.issue(user.id, null, new Date());
    const principal = await sessions.authenticate(current.token, { correlationId });
    if (principal === null) throw new Error('Fixture session missing');
    await identity.changePassword(principal, {
      userId: user.id,
      currentSessionId: current.sessionId,
      currentPassword: password,
      newPassword: 'Replacement-Audit-Passphrase-456!',
      correlationId,
    });
    expect(await sessions.authenticate(current.token, { correlationId })).not.toBeNull();
    expect(await sessions.authenticate(other.token, { correlationId })).toBeNull();
    expect(
      (await database.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).authVersion,
    ).toBe(1);
  });

  it('H06: consumption refuses invalidated and expired tokens even after a usable lookup', async () => {
    const user = await customer(),
      tokens = app.get(IdentityTokenRepository);
    const value = await token(user.id);
    const found = await tokens.findUsableByHash(hashToken(value), 'PASSWORD_RESET', new Date());
    if (found === null) throw new Error('Fixture token missing');
    await tokens.invalidateOutstanding(user.id, 'PASSWORD_RESET', new Date());
    expect(await tokens.consume(found.id, new Date())).toBe(false);
    const next = await token(user.id);
    const row = await tokens.findUsableByHash(hashToken(next), 'PASSWORD_RESET', new Date());
    if (row === null) throw new Error('Fixture token missing');
    await database.prisma.identityToken.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await tokens.consume(row.id, new Date())).toBe(false);
  });

  it('H06: reset rechecks token invalidation atomically with the password write', async () => {
    const user = await customer(),
      value = await token(user.id),
      tokens = app.get(IdentityTokenRepository);
    const before = await database.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    await tokens.invalidateOutstanding(user.id, 'PASSWORD_RESET', new Date());
    await expect(
      app.get(PasswordResetService).completeReset({
        token: value,
        newPassword: 'Replacement-Audit-Passphrase-456!',
        correlationId,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RECOVERY_TOKEN' });
    const after = await database.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.authVersion).toBe(before.authVersion);
  });

  it('H06: a token invalidated after lookup cannot change credentials', async () => {
    const user = await customer(),
      value = await token(user.id),
      users = app.get(UserRepository);
    const ready = gate(),
      resume = gate(),
      update = users.updatePassword.bind(users);
    const before = await database.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    jest.spyOn(users, 'updatePassword').mockImplementation(async (...args) => {
      ready.open();
      await resume.promise;
      return update(...args);
    });
    const resetting = app
      .get(PasswordResetService)
      .completeReset({
        token: value,
        newPassword: 'Replacement-Audit-Passphrase-456!',
        correlationId,
      })
      .then(
        () => ({ ok: true }),
        (error: unknown) => ({ error }),
      );
    try {
      await ready.promise;
      await app
        .get(IdentityTokenRepository)
        .invalidateOutstanding(user.id, 'PASSWORD_RESET', new Date());
      resume.open();
      expect(await resetting).toMatchObject({ error: { code: 'INVALID_RECOVERY_TOKEN' } });
      const after = await database.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.authVersion).toBe(before.authVersion);
    } finally {
      resume.open();
    }
  });

  it('H01/H06: failure to revoke sessions rolls back password mutation and token consumption', async () => {
    const user = await customer(),
      value = await token(user.id),
      p = database.prisma;
    const before = await p.user.findUniqueOrThrow({ where: { id: user.id } });
    const original = p.$transaction.bind(p);
    const intercepted = (work: (transaction: Prisma.TransactionClient) => Promise<unknown>) =>
      original((transaction) =>
        work(
          new Proxy(transaction, {
            get(target, key, receiver): unknown {
              if (key === 'session')
                return new Proxy(target.session, {
                  get(delegate, method, delegateReceiver): unknown {
                    if (method === 'updateMany')
                      return () => {
                        throw new Error('audit-injected-session-failure');
                      };
                    const member: unknown = Reflect.get(delegate, method, delegateReceiver);
                    return typeof member === 'function'
                      ? (member.bind(delegate) as unknown)
                      : member;
                  },
                });
              const member: unknown = Reflect.get(target, key, receiver);
              return typeof member === 'function' ? (member.bind(target) as unknown) : member;
            },
          }),
        ),
      );
    p.$transaction = intercepted as typeof p.$transaction;
    try {
      await expect(
        app.get(PasswordResetService).completeReset({
          token: value,
          newPassword: 'Replacement-Audit-Passphrase-456!',
          correlationId,
        }),
      ).rejects.toThrow('audit-injected-session-failure');
    } finally {
      p.$transaction = original;
    }
    const after = await p.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.authVersion).toBe(before.authVersion);
    const recovery = await p.identityToken.findUniqueOrThrow({
      where: { tokenHash: hashToken(value) },
    });
    expect(recovery.consumedAt).toBeNull();
    expect(recovery.invalidatedAt).toBeNull();
  });

  async function administrator() {
    const user = await database.prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        passwordHash: await hashPassword(password),
        role: 'ADMIN',
      },
    });
    const secret = generateSharedSecret();
    await database.prisma.adminMfaCredential.create({
      data: {
        userId: user.id,
        secretCiphertext: new SecretCipher(TEST_AUTH_ENCRYPTION_KEY).encrypt(secret),
        confirmedAt: new Date(),
        lastAcceptedStep: timeStepFor(Date.now()) - 1,
      },
    });
    return { user, secret };
  }

  it('H04: concurrent challenge issuance leaves exactly one usable challenge', async () => {
    const { user } = await administrator(),
      identity = app.get(IdentityService);
    await Promise.all([
      identity.signIn({ email: user.email, password, clientLabel: null, correlationId }),
      identity.signIn({ email: user.email, password, clientLabel: null, correlationId }),
    ]);
    expect(
      await database.prisma.identityToken.count({
        where: {
          userId: user.id,
          purpose: 'MFA_VERIFICATION',
          consumedAt: null,
          invalidatedAt: null,
        },
      }),
    ).toBe(1);
  });

  it('H04: even pre-existing parallel challenges cannot accept one TOTP twice', async () => {
    const { user, secret } = await administrator(),
      repo = app.get(MfaRepository),
      mfa = app.get(MfaService);
    const values = [randomUUID(), randomUUID()];
    await database.prisma.identityToken.createMany({
      data: values.map((value) => ({
        userId: user.id,
        purpose: 'MFA_VERIFICATION' as const,
        tokenHash: hashToken(value),
        expiresAt: new Date(Date.now() + 60_000),
      })),
    });
    const ready = gate(),
      read = repo.findCredential.bind(repo);
    let count = 0;
    jest.spyOn(repo, 'findCredential').mockImplementation(async (id) => {
      const record = await read(id);
      if (++count === 2) ready.open();
      await ready.promise;
      return record;
    });
    const code = generateTotpCode(secret, timeStepFor(Date.now()));
    const outcomes = await Promise.allSettled(
      values.map((challengeToken) =>
        mfa.completeVerification({ challengeToken, code, clientLabel: null, correlationId }),
      ),
    );
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await database.prisma.session.count({ where: { userId: user.id } })).toBe(1);
    expect(
      await database.prisma.identityToken.count({
        where: { userId: user.id, consumedAt: { not: null } },
      }),
    ).toBe(1);
  });

  it('M01: assembly and component reservations share a lock order under a forced overlap', async () => {
    const p = database.prisma,
      a = await product(),
      b = await product();
    const av = await p.productVariant.create({
      data: { id: '00000001-0000-4000-8000-000000000001', productId: a.id, sku: 'ORDER-A' },
    });
    const bv = await p.productVariant.create({
      data: { id: '00000002-0000-4000-8000-000000000001', productId: b.id, sku: 'ORDER-B' },
    });
    await p.inventoryItem.createMany({
      data: [
        { id: '00000020-0000-4000-8000-000000000001', variantId: av.id },
        { id: '00000010-0000-4000-8000-000000000001', variantId: bv.id },
      ],
    });
    await inventory.setOnHand(av.id, 10, null);
    await inventory.setOnHand(bv.id, 10, null);
    const parent = await product(),
      bundles = app.get(BundleService),
      ir = app.get(InventoryRepository);
    const bundle = await bundles.create({
      productId: parent.id,
      kind: 'FIXED',
      name: 'Lock order',
      components: [
        { variantId: av.id, quantity: 1 },
        { variantId: bv.id, quantity: 1 },
      ],
    });
    await p.inventoryItem.create({
      data: { id: '00000030-0000-4000-8000-000000000001', bundleId: bundle.record.id },
    });
    const assemblyLocked = gate(),
      resumeAssembly = gate(),
      holdStarted = gate();
    let assemblyFirst = true,
      holdFirst = true;
    const originalTransaction = p.$transaction.bind(p),
      hold = ir.hold.bind(ir);
    const intercept = (work: (transaction: Prisma.TransactionClient) => Promise<unknown>) =>
      originalTransaction((transaction) =>
        work(
          new Proxy(transaction, {
            get(target, key, receiver): unknown {
              if (key === '$executeRaw')
                return async (...args: Parameters<Prisma.TransactionClient['$executeRaw']>) => {
                  const result = await target.$executeRaw(...args);
                  if (assemblyFirst) {
                    assemblyFirst = false;
                    assemblyLocked.open();
                    await resumeAssembly.promise;
                  }
                  return result;
                };
              const value: unknown = Reflect.get(target, key, receiver);
              return typeof value === 'function' ? (value.bind(target) as unknown) : value;
            },
          }),
        ),
      );
    p.$transaction = intercept as typeof p.$transaction;
    jest.spyOn(ir, 'hold').mockImplementation(async (...args) => {
      if (holdFirst) {
        holdFirst = false;
        if (args[1] === '00000020-0000-4000-8000-000000000001') {
          const result = await hold(...args);
          holdStarted.open();
          return result;
        }
        holdStarted.open();
      }
      return hold(...args);
    });
    try {
      const assembly = bundles.assemble(bundle.record.id, 1);
      await assemblyLocked.promise;
      const reserving = reservations.create({
        idempotencyKey: randomUUID(),
        lines: [
          { sku: av.sku, quantity: 1 },
          { sku: bv.sku, quantity: 1 },
        ],
      });
      await holdStarted.promise;
      resumeAssembly.open();
      const results = await Promise.allSettled([assembly, reserving]);
      expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
      const items = await p.inventoryItem.findMany({
        where: { variantId: { in: [av.id, bv.id] } },
      });
      for (const item of items) expect(item).toMatchObject({ onHand: 9, reserved: 1 });
    } finally {
      resumeAssembly.open();
      p.$transaction = originalTransaction;
    }
  });
});
