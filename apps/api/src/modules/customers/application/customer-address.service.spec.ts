import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import type {
  CustomerAddressAttributes,
  CustomerAddressRecord,
  CustomerAddressRepository,
  CustomerAddressUpdate,
} from '../persistence/customer-address.repository';
import type {
  CustomerProfileRecord,
  CustomerProfileRepository,
  ProfileAttributeUpdate,
} from '../persistence/customer-profile.repository';
import { CustomerAddressService } from './customer-address.service';

const NOW = new Date('2026-10-19T12:00:00.000Z');
const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_CUSTOMER_ID = '22222222-2222-4222-8222-222222222222';

const PRINCIPAL: AuthenticatedPrincipal = {
  userId: CUSTOMER_ID,
  role: 'CUSTOMER',
  sessionId: '33333333-3333-4333-8333-333333333333',
  sessionExpiresAt: new Date('2026-10-20T12:00:00.000Z'),
};

const ADDRESS_INPUT: CustomerAddressAttributes = {
  recipientName: 'Ada Lovelace',
  line1: '1 Analytical Engine Way',
  line2: null,
  city: 'London',
  region: null,
  postalCode: null,
  countryCode: 'GB',
  phone: null,
};

function profileRecord(defaultAddressId: string | null = null): CustomerProfileRecord {
  return {
    id: CUSTOMER_ID,
    userId: CUSTOMER_ID,
    displayName: null,
    phone: null,
    defaultAddressId,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function addressRecord(
  id: string,
  customerId: string,
  overrides: Partial<CustomerAddressAttributes> = {},
): CustomerAddressRecord {
  return { id, customerId, ...ADDRESS_INPUT, ...overrides, createdAt: NOW, updatedAt: NOW };
}

/**
 * Repository fakes. The service's decisions are the unit under test here; the real repositories and the
 * database invariants are covered by the PostgreSQL integration suite.
 */
class FakeProfileRepository {
  public profile: CustomerProfileRecord;
  public readonly referenceWrites: (string | null)[] = [];

  public constructor(profile: CustomerProfileRecord) {
    this.profile = profile;
  }

  public findOrCreateByUserId(): Promise<CustomerProfileRecord> {
    return Promise.resolve(this.profile);
  }

  public updateAttributes(
    _profileId: string,
    update: ProfileAttributeUpdate,
  ): Promise<CustomerProfileRecord> {
    this.profile = {
      ...this.profile,
      ...(update.displayName === undefined ? {} : { displayName: update.displayName }),
      ...(update.phone === undefined ? {} : { phone: update.phone }),
      updatedAt: NOW,
    };
    return Promise.resolve(this.profile);
  }

  public setDefaultAddress(
    _profileId: string,
    addressId: string | null,
  ): Promise<CustomerProfileRecord> {
    this.referenceWrites.push(addressId);
    this.profile = { ...this.profile, defaultAddressId: addressId };
    return Promise.resolve(this.profile);
  }

  public setDefaultAddressIfUnset(_profileId: string, addressId: string): Promise<boolean> {
    if (this.profile.defaultAddressId !== null) return Promise.resolve(false);
    this.referenceWrites.push(addressId);
    this.profile = { ...this.profile, defaultAddressId: addressId };
    return Promise.resolve(true);
  }
}

class FakeAddressRepository {
  public readonly rows = new Map<string, CustomerAddressRecord>();
  public readonly deletedIds: string[] = [];

  public create(
    customerId: string,
    attributes: CustomerAddressAttributes,
  ): Promise<CustomerAddressRecord> {
    const id = `address-${this.rows.size + 1}`;
    const record = { id, customerId, ...attributes, createdAt: NOW, updatedAt: NOW };
    this.rows.set(id, record);
    return Promise.resolve(record);
  }

  public listByCustomerId(customerId: string): Promise<readonly CustomerAddressRecord[]> {
    return Promise.resolve([...this.rows.values()].filter((row) => row.customerId === customerId));
  }

  public findOwnedById(
    addressId: string,
    customerId: string,
  ): Promise<CustomerAddressRecord | null> {
    const row = this.rows.get(addressId);
    return Promise.resolve(row !== undefined && row.customerId === customerId ? row : null);
  }

  public updateOwned(
    addressId: string,
    customerId: string,
    update: CustomerAddressUpdate,
  ): Promise<CustomerAddressRecord | null> {
    const owned = this.rows.get(addressId);
    if (owned === undefined || owned.customerId !== customerId) return Promise.resolve(null);
    const next: CustomerAddressRecord = {
      ...owned,
      ...(update.recipientName === undefined ? {} : { recipientName: update.recipientName }),
      ...(update.line1 === undefined ? {} : { line1: update.line1 }),
      ...(update.line2 === undefined ? {} : { line2: update.line2 }),
      ...(update.city === undefined ? {} : { city: update.city }),
      ...(update.region === undefined ? {} : { region: update.region }),
      ...(update.postalCode === undefined ? {} : { postalCode: update.postalCode }),
      ...(update.countryCode === undefined ? {} : { countryCode: update.countryCode }),
      ...(update.phone === undefined ? {} : { phone: update.phone }),
      updatedAt: NOW,
    };
    this.rows.set(addressId, next);
    return Promise.resolve(next);
  }

  public deleteOwned(addressId: string, customerId: string): Promise<boolean> {
    const owned = this.rows.get(addressId);
    if (owned === undefined || owned.customerId !== customerId) return Promise.resolve(false);
    this.rows.delete(addressId);
    this.deletedIds.push(addressId);
    return Promise.resolve(true);
  }
}

function build(profile: CustomerProfileRecord) {
  const profiles = new FakeProfileRepository(profile);
  const addresses = new FakeAddressRepository();
  const service = new CustomerAddressService(
    profiles as unknown as CustomerProfileRepository,
    addresses as unknown as CustomerAddressRepository,
  );
  return { profiles, addresses, service };
}

describe('CustomerAddressService', () => {
  it('promotes the first saved address to the default (HC-ASM-M03-001)', async () => {
    const { service } = build(profileRecord());

    const created = await service.create(PRINCIPAL, ADDRESS_INPUT);

    expect(created.isDefault).toBe(true);
  });

  it('leaves an existing default alone when a further address is saved', async () => {
    const { service, profiles } = build(profileRecord('address-existing'));

    const created = await service.create(PRINCIPAL, ADDRESS_INPUT);

    expect(created.isDefault).toBe(false);
    expect(profiles.profile.defaultAddressId).toBe('address-existing');
  });

  it('reports the default flag from the profile reference when listing', async () => {
    const { service, addresses } = build(profileRecord('second'));
    addresses.rows.set('second', addressRecord('second', CUSTOMER_ID));
    addresses.rows.set('other', addressRecord('other', CUSTOMER_ID));

    const listed = await service.list(PRINCIPAL);

    expect(listed.map((address) => [address.id, address.isDefault])).toEqual([
      ['second', true],
      ['other', false],
    ]);
  });

  it('refuses to read an address that belongs to another customer', async () => {
    const { service, addresses } = build(profileRecord());
    addresses.rows.set('foreign', addressRecord('foreign', OTHER_CUSTOMER_ID));

    await expect(service.read(PRINCIPAL, 'foreign')).rejects.toMatchObject({
      code: 'ADDRESS_NOT_FOUND',
    });
  });

  it('refuses to read an address that never existed, indistinguishably', async () => {
    const { service } = build(profileRecord());

    await expect(service.read(PRINCIPAL, 'missing')).rejects.toMatchObject({
      code: 'ADDRESS_NOT_FOUND',
    });
  });

  it('does not update an address that belongs to another customer', async () => {
    const { service, addresses } = build(profileRecord());
    addresses.rows.set('foreign', addressRecord('foreign', OTHER_CUSTOMER_ID));

    await expect(service.update(PRINCIPAL, 'foreign', { city: 'Paris' })).rejects.toMatchObject({
      code: 'ADDRESS_NOT_FOUND',
    });
    expect(addresses.rows.get('foreign')?.city).toBe('London');
  });

  it('does not delete an address that belongs to another customer', async () => {
    const { service, addresses } = build(profileRecord());
    addresses.rows.set('foreign', addressRecord('foreign', OTHER_CUSTOMER_ID));

    await expect(service.remove(PRINCIPAL, 'foreign')).rejects.toMatchObject({
      code: 'ADDRESS_NOT_FOUND',
    });
    expect(addresses.rows.has('foreign')).toBe(true);
  });

  it('does not claim an address that belongs to another customer as the default', async () => {
    const { service, addresses, profiles } = build(profileRecord());
    addresses.rows.set('foreign', addressRecord('foreign', OTHER_CUSTOMER_ID));

    await expect(service.setDefault(PRINCIPAL, 'foreign')).rejects.toMatchObject({
      code: 'ADDRESS_NOT_FOUND',
    });
    expect(profiles.referenceWrites).toEqual([]);
  });

  it('records the reference and reports the address as the default when one is selected', async () => {
    const { service, addresses, profiles } = build(profileRecord());
    addresses.rows.set('mine', addressRecord('mine', CUSTOMER_ID));

    const selected = await service.setDefault(PRINCIPAL, 'mine');

    expect(selected.isDefault).toBe(true);
    expect(profiles.referenceWrites).toEqual(['mine']);
    expect(profiles.profile.defaultAddressId).toBe('mine');
  });

  it('applies a partial update to an owned address and reports it as not the default', async () => {
    const { service, addresses } = build(profileRecord());
    addresses.rows.set('mine', addressRecord('mine', CUSTOMER_ID));

    const updated = await service.update(PRINCIPAL, 'mine', { city: 'Paris' });

    expect(updated.city).toBe('Paris');
    expect(updated.isDefault).toBe(false);
  });

  it('removes an owned address', async () => {
    const { service, addresses } = build(profileRecord());
    addresses.rows.set('mine', addressRecord('mine', CUSTOMER_ID));

    await service.remove(PRINCIPAL, 'mine');

    expect(addresses.deletedIds).toEqual(['mine']);
  });
});
