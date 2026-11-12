import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (connectionString === undefined) {
  process.stderr.write('DATABASE_URL is required (value is never printed).\n');
  process.exit(1);
}

const deadline = Date.now() + Number(process.env.DATABASE_STARTUP_TIMEOUT_MS ?? 5000);
let lastError;
while (Date.now() < deadline) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 1000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    process.stdout.write('PostgreSQL is ready.\n');
    process.exit(0);
  } catch (error) {
    lastError = error;
    await client.end().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
void lastError;
process.stderr.write('PostgreSQL did not become ready within the configured bound.\n');
process.exit(1);
