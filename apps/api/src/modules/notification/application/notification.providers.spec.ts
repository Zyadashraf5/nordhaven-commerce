import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { FileNotificationProvider, MemoryNotificationProvider } from './notification.providers';
import type { CustomerNotification } from '../contracts';
const message = (): CustomerNotification => ({
  deliveryKey: randomUUID(),
  kind: 'REVIEW_APPROVED',
  recipient: { userId: randomUUID() },
  subject: 'Local test',
  body: 'Test only',
});
describe('local notification delivery integrity', () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'hc-delivery-'));
  });
  afterEach(async () => {
    for (const name of await readdir(directory)) await unlink(path.join(directory, name));
    await rmdir(directory);
  });
  it('keeps distinct same-kind messages and exactly one artifact per concurrent replay', async () => {
    const provider = new FileNotificationProvider(directory),
      first = message(),
      second = message();
    const results = await Promise.all([
      provider.deliver(first),
      provider.deliver(first),
      provider.deliver(second),
    ]);
    expect(results.every((result) => result.delivered)).toBe(true);
    expect((await readdir(directory)).sort()).toEqual(
      [first.deliveryKey + '.json', second.deliveryKey + '.json'].sort(),
    );
    expect(
      JSON.parse(await readFile(path.join(directory, first.deliveryKey + '.json'), 'utf8')),
    ).toMatchObject({ body: first.body, recipientUserId: first.recipient.userId });
  });
  it.each(['{', JSON.stringify({ body: 'different' })])(
    'does not acknowledge or overwrite an incomplete or mismatched artifact %s',
    async (existing) => {
      const provider = new FileNotificationProvider(directory),
        item = message(),
        target = path.join(directory, item.deliveryKey + '.json');
      await writeFile(target, existing, { flag: 'wx' });
      await expect(provider.deliver(item)).rejects.toThrow('integrity mismatch');
      expect(await readFile(target, 'utf8')).toBe(existing);
      expect(await readdir(directory)).toEqual([item.deliveryKey + '.json']);
    },
  );
  it('accepts an intact artifact using the legacy pretty formatting', async () => {
    const provider = new FileNotificationProvider(directory),
      item = message();
    await writeFile(
      path.join(directory, item.deliveryKey + '.json'),
      JSON.stringify(
        {
          kind: item.kind,
          recipientUserId: item.recipient.userId,
          subject: item.subject,
          body: item.body,
          metadata: {},
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx' },
    );
    expect((await provider.deliver(item)).delivered).toBe(true);
    expect(await readdir(directory)).toEqual([item.deliveryKey + '.json']);
  });
  it('deduplicates memory delivery identity', async () => {
    const provider = new MemoryNotificationProvider(),
      item = message();
    await Promise.all([provider.deliver(item), provider.deliver(item)]);
    expect(provider.delivered).toEqual([item]);
  });
  it('refuses both local transports in production', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => new FileNotificationProvider(directory)).toThrow('not permitted');
      expect((await new MemoryNotificationProvider().deliver(message())).delivered).toBe(false);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
