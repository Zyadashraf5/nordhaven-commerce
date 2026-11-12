import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { CustomerAddressService } from '../../apps/api/src/modules/customers/application/customer-address.service';
import { CustomerProfileService } from '../../apps/api/src/modules/customers/application/customer-profile.service';
import { CustomerProfileRepository } from '../../apps/api/src/modules/customers/persistence/customer-profile.repository';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import type { AuthenticatedPrincipal } from '../../apps/api/src/platform/security/principal';
import { resetCustomerDatabase } from '../helpers/customer-database';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CUSTOMER_USER_ID = '4f1e0d9c-8b7a-4695-8432-1f0e9d8c7b61';
const OTHER_USER_ID = '4f1e0d9c-8b7a-4695-8432-1f0e9d8c7b62';

type Application = Awaited<ReturnType<typeof createApplication>>['app'];

function principalFor(userId: string): AuthenticatedPrincipal {
  return {
    userId,
    role: 'CUSTOMER',
    sessionId: '5f1e0d9c-8b7a-4695-8432-1f0e9d8c7b63',
    sessionExpiresAt: new Date('2026-10-20T12:00:00.000Z'),
  };
}

const ADDRESS_INPUT = {
  recipientName: 'Ada Lovelace',
  line1: '1 Analytical Engine Way',
  line2: null,
  city: 'London',
  region: null,
  postalCode: null,
  countryCode: 'GB',
  phone: null,
} as const;

describe('Customer Profiles persistence integration', () => {
  let app: Application;
  let database: DatabaseService;
  let profiles: CustomerProfileRepository;
  let profileService: CustomerProfileService;
  let addressService: CustomerAddressService;

  beforeAll(async () => {
    const created = await createApplication({ configuration: testConfigurationFor('integration') });
    app = created.app;
    database = app.get(DatabaseService);
    profiles = app.get(CustomerProfileRepository);
    profileService = app.get(CustomerProfileService);
    addressService = app.get(CustomerAddressService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetIdentityDatabase(database);
    await resetCustomerDatabase(database);
  });

  afterEach(async () => {
    await resetCustomerDatabase(database);
    await resetIdentityDatabase(database);
  });

  describe('profile', () => {
    it('creates exactly one profile for concurrent first access', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => profiles.findOrCreateByUserId(CUSTOMER_USER_ID)),
      );

      const ids = new Set(results.map((profile) => profile.id));
      expect(ids.size).toBe(1);
      expect(await database.prisma.customerProfile.count()).toBe(1);
    });

    it('keeps one profile per customer identity', async () => {
      const first = await profiles.findOrCreateByUserId(CUSTOMER_USER_ID);
      const again = await profiles.findOrCreateByUserId(CUSTOMER_USER_ID);

      expect(again.id).toBe(first.id);
      expect(await database.prisma.customerProfile.count()).toBe(1);
    });

    it('stores and clears the optional attributes', async () => {
      await profileService.read(principalFor(CUSTOMER_USER_ID));

      const set = await profileService.update(principalFor(CUSTOMER_USER_ID), {
        displayName: 'Ada Lovelace',
        phone: '+44 20 7946 0000',
      });
      expect(set.displayName).toBe('Ada Lovelace');
      expect(set.phone).toBe('+44 20 7946 0000');

      const cleared = await profileService.update(principalFor(CUSTOMER_USER_ID), {
        displayName: null,
      });
      expect(cleared.displayName).toBeNull();
      expect(cleared.phone).toBe('+44 20 7946 0000');
    });

    it('does not reach across modules: removing an identity leaves the profile in place', async () => {
      await profiles.findOrCreateByUserId(CUSTOMER_USER_ID);
      await database.prisma.user.create({
        data: {
          id: CUSTOMER_USER_ID,
          email: 'cross-module@example.test',
          passwordHash: 'not-a-real-hash',
          role: 'CUSTOMER',
        },
      });

      await database.prisma.user.delete({ where: { id: CUSTOMER_USER_ID } });

      expect(
        await database.prisma.customerProfile.count({ where: { userId: CUSTOMER_USER_ID } }),
      ).toBe(1);
    });
  });

  describe('addresses', () => {
    it('round-trips an address, including the country code', async () => {
      const created = await addressService.create(principalFor(CUSTOMER_USER_ID), ADDRESS_INPUT);

      const read = await addressService.read(principalFor(CUSTOMER_USER_ID), created.id);

      expect(read).toMatchObject({
        recipientName: 'Ada Lovelace',
        line1: '1 Analytical Engine Way',
        city: 'London',
        countryCode: 'GB',
        line2: null,
        isDefault: true,
      });
    });

    it('lists only the calling customer addresses in a deterministic order', async () => {
      const first = await addressService.create(principalFor(CUSTOMER_USER_ID), ADDRESS_INPUT);
      await addressService.create(principalFor(OTHER_USER_ID), ADDRESS_INPUT);
      const second = await addressService.create(principalFor(CUSTOMER_USER_ID), {
        ...ADDRESS_INPUT,
        city: 'Paris',
      });
      // Pin a distinct, later creation time so the documented order is observable regardless of the
      // clock resolution of the two near-simultaneous inserts.
      await database.prisma.customerAddress.update({
        where: { id: second.id },
        data: { createdAt: new Date(first.createdAt.getTime() + 1000) },
      });

      const mine = await addressService.list(principalFor(CUSTOMER_USER_ID));

      expect(mine.map((address) => address.city)).toEqual(['London', 'Paris']);
      expect(await database.prisma.customerAddress.count()).toBe(3);

      const repeated = await addressService.list(principalFor(CUSTOMER_USER_ID));
      expect(repeated.map((address) => address.id)).toEqual(mine.map((address) => address.id));
    });

    it('updates only an owned address and leaves omitted attributes unchanged', async () => {
      const created = await addressService.create(principalFor(CUSTOMER_USER_ID), ADDRESS_INPUT);

      const updated = await addressService.update(principalFor(CUSTOMER_USER_ID), created.id, {
        city: 'Paris',
        phone: null,
      });

      expect(updated.city).toBe('Paris');
      expect(updated.line1).toBe('1 Analytical Engine Way');
      expect(updated.phone).toBeNull();

      const untouched = await addressService.read(principalFor(CUSTOMER_USER_ID), created.id);
      expect(untouched.city).toBe('Paris');
    });

    it('deletes only an owned address', async () => {
      const created = await addressService.create(principalFor(CUSTOMER_USER_ID), ADDRESS_INPUT);

      await addressService.remove(principalFor(CUSTOMER_USER_ID), created.id);

      await expect(
        addressService.read(principalFor(CUSTOMER_USER_ID), created.id),
      ).rejects.toMatchObject({ code: 'ADDRESS_NOT_FOUND' });
    });

    it('refuses every cross-customer operation with the same identical failure', async () => {
      const mine = await addressService.create(principalFor(CUSTOMER_USER_ID), ADDRESS_INPUT);
      const other = principalFor(OTHER_USER_ID);

      const failures = await Promise.allSettled([
        addressService.read(other, mine.id),
        addressService.update(other, mine.id, { city: 'Stolen' }),
        addressService.remove(other, mine.id),
        addressService.setDefault(other, mine.id),
      ]);

      for (const failure of failures) {
        expect(failure.status).toBe('rejected');
        if (failure.status === 'rejected') {
          expect(failure.reason).toMatchObject({ code: 'ADDRESS_NOT_FOUND' });
        }
      }

      const stored = await database.prisma.customerAddress.findUnique({ where: { id: mine.id } });
      expect(stored?.city).toBe('London');

      const otherProfile = await database.prisma.customerProfile.findUnique({
        where: { userId: OTHER_USER_ID },
      });
      expect(otherProfile?.defaultAddressId ?? null).toBeNull();
    });

    it('answers an unknown identifier exactly like a foreign one', async () => {
      await addressService.create(principalFor(CUSTOMER_USER_ID), ADDRESS_INPUT);

      await expect(
        addressService.read(principalFor(CUSTOMER_USER_ID), '8f1e0d9c-8b7a-4695-8432-1f0e9d8c7b99'),
      ).rejects.toMatchObject({ code: 'ADDRESS_NOT_FOUND' });
    });
  });

  describe('default address', () => {
    it('promotes the first saved address and does not move the selection afterwards', async () => {
      const first = await addressService.create(principalFor(CUSTOMER_USER_ID), ADDRESS_INPUT);
      const second = await addressService.create(principalFor(CUSTOMER_USER_ID), {
        ...ADDRESS_INPUT,
        city: 'Paris',
      });

      expect(first.isDefault).toBe(true);
      expect(second.isDefault).toBe(false);
    });

    it('keeps exactly one default under concurrent selection', async () => {
      const first = await addressService.create(principalFor(CUSTOMER_USER_ID), ADDRESS_INPUT);
      const second = await addressService.create(principalFor(CUSTOMER_USER_ID), {
        ...ADDRESS_INPUT,
        city: 'Paris',
      });

      await Promise.all([
        addressService.setDefault(principalFor(CUSTOMER_USER_ID), first.id),
        addressService.setDefault(principalFor(CUSTOMER_USER_ID), second.id),
      ]);

      const profile = await database.prisma.customerProfile.findUnique({
        where: { userId: CUSTOMER_USER_ID },
      });
      expect(profile?.defaultAddressId).not.toBeNull();

      const listed = await addressService.list(principalFor(CUSTOMER_USER_ID));
      expect(listed.filter((address) => address.isDefault)).toHaveLength(1);
    });

    it('clears the selection when the default address is deleted', async () => {
      const first = await addressService.create(principalFor(CUSTOMER_USER_ID), ADDRESS_INPUT);
      const second = await addressService.create(principalFor(CUSTOMER_USER_ID), {
        ...ADDRESS_INPUT,
        city: 'Paris',
      });
      expect(first.isDefault).toBe(true);

      await addressService.remove(principalFor(CUSTOMER_USER_ID), first.id);

      const profile = await database.prisma.customerProfile.findUnique({
        where: { userId: CUSTOMER_USER_ID },
      });
      expect(profile?.defaultAddressId ?? null).toBeNull();

      const listed = await addressService.list(principalFor(CUSTOMER_USER_ID));
      expect(listed.map((address) => [address.id, address.isDefault])).toEqual([
        [second.id, false],
      ]);
    });

    it('is idempotent when the address is already the default', async () => {
      const created = await addressService.create(principalFor(CUSTOMER_USER_ID), ADDRESS_INPUT);

      const selected = await addressService.setDefault(principalFor(CUSTOMER_USER_ID), created.id);

      expect(selected.isDefault).toBe(true);
      expect(selected.id).toBe(created.id);
    });
  });

  describe('schema invariants', () => {
    it('removes every address when its owning profile is removed', async () => {
      const created = await addressService.create(principalFor(CUSTOMER_USER_ID), ADDRESS_INPUT);

      await database.prisma.customerProfile.delete({ where: { userId: CUSTOMER_USER_ID } });

      expect(await database.prisma.customerAddress.count({ where: { id: created.id } })).toBe(0);
    });

    it('enforces one profile per identity at the database level', async () => {
      await profiles.findOrCreateByUserId(CUSTOMER_USER_ID);

      await expect(
        database.prisma.customerProfile.create({ data: { userId: CUSTOMER_USER_ID } }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });
});
