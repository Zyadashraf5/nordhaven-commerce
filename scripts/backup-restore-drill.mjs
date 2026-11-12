#!/usr/bin/env node
/** Non-destructive local restore drill: retain the archive and brand-new restored database. */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const source = process.argv[2];
if (!source || !/^hc_batch_final_20261021_(dev|integration|e2e)$/.test(source))
  throw new Error('Explicit owned isolated source required');
const directory = process.env.NORDHAVEN_BACKUP_DIR;
if (!directory || !path.isAbsolute(directory))
  throw new Error('Absolute durable NORDHAVEN_BACKUP_DIR required');
const container = process.env.NORDHAVEN_POSTGRES_CONTAINER ?? 'nordhaven-commerce-postgres-1';
const user = process.env.NORDHAVEN_POSTGRES_USER ?? 'nordhaven';
const id = randomUUID().replaceAll('-', ''),
  restored = 'hc_restore_' + id,
  remote = '/tmp/hc-' + id + '.dump';
mkdirSync(directory, { recursive: true, mode: 0o700 });
const archive = path.join(directory, id + '.dump'),
  manifest = path.join(directory, id + '.json');
if (existsSync(archive) || existsSync(manifest)) throw new Error('Refusing existing artifact');
function run(args) {
  const r = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0)
    throw new Error('Local restore command failed: ' + (r.stderr ?? '').slice(0, 1500));
  return r.stdout.trim();
}
const exec = (args) => run(['exec', container, ...args]);
const query = (database, sql) =>
  exec(['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database, '-t', '-A', '-c', sql]);
function fingerprint(database) {
  const names = JSON.parse(
    query(
      database,
      "SELECT coalesce(json_agg(tablename ORDER BY tablename),'[]'::json) FROM pg_tables WHERE schemaname='public'",
    ),
  );
  const data = {};
  for (const name of names) {
    if (!/^[a-z_]+$/.test(name)) throw new Error('Unsupported table name');
    data[name] = JSON.parse(
      query(
        database,
        `SELECT json_build_object('rows',count(*),'hash',md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),''))) FROM "${name}" t`,
      ),
    );
  }
  return data;
}
const result = {
  source,
  restoredDatabase: restored,
  archive,
  startedUtc: new Date().toISOString(),
  status: 'STARTED',
};
const save = () => writeFileSync(manifest, JSON.stringify(result, null, 2), { mode: 0o600 });
save();
try {
  if (query(source, 'SELECT current_database()') !== source)
    throw new Error('Source identity mismatch');
  const before = fingerprint(source);
  result.sourceBefore = before;
  if (
    !Object.entries(before).some(([name, value]) => name !== '_prisma_migrations' && value.rows > 0)
  )
    throw new Error('Non-empty business-data proof required');
  exec([
    'pg_dump',
    '-U',
    user,
    '-d',
    source,
    '--format=custom',
    '--no-owner',
    '--no-privileges',
    '--file',
    remote,
  ]);
  run(['cp', container + ':' + remote, archive]);
  const bytes = readFileSync(archive);
  if (!bytes.length) throw new Error('Empty archive');
  result.archiveBytes = bytes.length;
  result.archiveSha256 = createHash('sha256').update(bytes).digest('hex');
  exec(['pg_restore', '--list', remote]);
  exec(['pg_restore', '--file=/dev/null', remote]);
  query('postgres', `CREATE DATABASE "${restored}"`);
  exec([
    'pg_restore',
    '-U',
    user,
    '-d',
    restored,
    '--no-owner',
    '--no-privileges',
    '--exit-on-error',
    remote,
  ]);
  result.restored = fingerprint(restored);
  result.sourceAfter = fingerprint(source);
  if (
    JSON.stringify(before) !== JSON.stringify(result.restored) ||
    JSON.stringify(before) !== JSON.stringify(result.sourceAfter)
  )
    throw new Error('All-table content preservation mismatch');
  result.migrations = Number(
    query(
      restored,
      'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
    ),
  );
  if (result.migrations !== 26) throw new Error('Unexpected migration history');
  result.status = 'PASSED';
  result.finishedUtc = new Date().toISOString();
  save();
  console.log(
    JSON.stringify(
      {
        status: result.status,
        archive,
        manifest,
        restoredDatabase: restored,
        tables: Object.keys(before).length,
        migrations: result.migrations,
        archiveSha256: result.archiveSha256,
      },
      null,
      2,
    ),
  );
} catch (error) {
  result.status = 'FAILED';
  result.reason = error.message;
  save();
  throw error;
}
