import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createApplication } = require('../apps/api/dist/bootstrap/create-application.js');
const { createOpenApiDocument } = require('../apps/api/dist/platform/openapi/openapi.js');

function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortDeep(value[key])]),
    );
  }
  return value;
}

const output = path.resolve(process.argv[2] ?? 'openapi/openapi.json');
const configuration = {
  nodeEnv: 'test',
  port: 3000,
  databaseUrl: 'postgresql://test:test@localhost:5432/nordhaven_unit_e2e',
  logLevel: 'silent',
  databaseStartupTimeoutMs: 5000,
  databaseProbeTimeoutMs: 1000,
  shutdownTimeoutMs: 8000,
  authEncryptionKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
};
const { app } = await createApplication({ configuration, initializeDatabase: false });
try {
  const document = sortDeep(createOpenApiDocument(app));
  await writeFile(output, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
} finally {
  await app.close();
}
