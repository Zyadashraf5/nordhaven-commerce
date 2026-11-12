# Jest project layout

The root `jest.config.ts` defines four independently selectable projects: unit, integration, E2E,
and process. Database-backed projects run serially through their public package scripts and must
pass the guards in `test/helpers/database-guard.ts` before accessing PostgreSQL.
