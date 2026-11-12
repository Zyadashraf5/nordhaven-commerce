#!/usr/bin/env node
/** Local one-shot regression for runtime packaging; never starts a listener or migrates data. */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
const source = process.env.DATABASE_URL;
let url;
try {
  url = new URL(source);
  if (
    !['postgresql:', 'postgres:'].includes(url.protocol) ||
    !/^hc_batch_final_20261021_(dev|integration|e2e)$/.test(
      decodeURIComponent(url.pathname.slice(1)),
    ) ||
    [...url.searchParams.keys()].some((key) => ['database', 'dbname'].includes(key.toLowerCase()))
  )
    throw new Error();
} catch {
  throw new Error('Explicit owned isolated database required for image smoke');
}
const expectedDatabase = decodeURIComponent(url.pathname.slice(1));
if (['localhost', '127.0.0.1'].includes(url.hostname)) url.hostname = 'host.docker.internal';
const image = process.env.NORDHAVEN_IMAGE ?? 'nordhaven-commerce:local-readiness-20261022';
if (!/^nordhaven-commerce:[a-z0-9-]+$/.test(image))
  throw new Error('Explicit local Nordhaven image required');
const migrations = readdirSync('prisma/migrations').filter((name) => /^\d/.test(name)).length;
const proof = `
const fs=require('node:fs'),zlib=require('node:zlib');
const {createApplication}=require('./dist/bootstrap/create-application.js');
const {loadEnvironment}=require('./dist/platform/config/environment.js');
const {DatabaseService}=require('./dist/platform/database/database.service.js');
(async()=>{
 if(process.getuid()===0)throw Error('Runtime must not be root');
 for(const p of ['/usr/local/lib/node_modules/npm','/usr/local/lib/node_modules/corepack','/opt/yarn-v1.22.22'])if(fs.existsSync(p))throw Error('Unexpected runtime package manager');
 const record=fs.readFileSync('/lib/apk/db/installed','utf8').split(String.fromCharCode(10,10)).find(block=>block.split(String.fromCharCode(10)).includes('P:zlib'));
 const version=record?.split(String.fromCharCode(10)).find(line=>line.startsWith('V:'))?.slice(2);
 const zlibPackage='zlib-'+version;
 if(zlibPackage!=='zlib-1.3.2-r1')throw Error('Missing reviewed zlib security revision');
 if(zlib.inflateSync(zlib.deflateSync(Buffer.from('local-readiness'))).toString()!=='local-readiness')throw Error('Compression regression');
 const configuration=loadEnvironment({NODE_ENV:'production',DATABASE_URL:process.env.DATABASE_URL,AUTH_ENCRYPTION_KEY:'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',LOG_LEVEL:'silent'});
 const {app}=await createApplication({configuration});
 try{const rows=await app.get(DatabaseService).prisma.$queryRawUnsafe('SELECT current_database() database,(SELECT count(*)::int FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) migrations');
 if(rows[0].database!==process.env.NORDHAVEN_EXPECTED_DB||rows[0].migrations!==Number(process.env.NORDHAVEN_EXPECTED_MIGRATIONS))throw Error('Runtime database mismatch');
 console.log(JSON.stringify({nonRoot:process.getuid(),packageManagersAbsent:true,zlibPackage,compression:true,listenersOpened:false,...rows[0]}));
 }finally{await app.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1});`;
const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--add-host',
    'host.docker.internal:host-gateway',
    '--env',
    'DATABASE_URL',
    '--env',
    'NORDHAVEN_EXPECTED_DB',
    '--env',
    'NORDHAVEN_EXPECTED_MIGRATIONS',
    '--entrypoint',
    'node',
    image,
    '-e',
    proof,
  ],
  {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      DATABASE_URL: url.toString(),
      NORDHAVEN_EXPECTED_DB: expectedDatabase,
      NORDHAVEN_EXPECTED_MIGRATIONS: String(migrations),
    },
  },
);
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.status !== 0) process.exitCode = result.status ?? 1;
