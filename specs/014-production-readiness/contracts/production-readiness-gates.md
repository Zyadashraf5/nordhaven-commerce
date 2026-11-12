# Contract: Milestone 14 - Production Readiness Gates

**Date**: 2026-10-21

**Status**: **Delivered.** The three gates are first-class package commands, and the OpenAPI
contract was **not** changed by this milestone: it adds no route.

## The gates

| Command | What it proves | What it touches |
| ------- | --------------- | --------------- |
| `pnpm readiness:check` | The production guards, the security posture, the deployment configuration, the contract, the schema, and the dependency posture. | The repository and the schema validation. |
| `pnpm readiness:backup-drill [database]` | That the platform's database can be captured and **restored**, and that the restored copy holds the same data. | The named database, read only, plus a scratch database it creates and drops. It **refuses** the three original databases. |
| `pnpm readiness:performance` | The measured response times, and the availability and authentication behaviour. | The database named by `DATABASE_URL`, read only. |

## The readiness check's sixteen rules

| # | Rule | What it reads |
| - | ---- | ------------- |
| 1 | the shipped payment provider refuses to operate in production | the provider's source |
| 2 | the shipped notification transports refuse to operate in production | the providers' source |
| 3 | the customer notification channel defaults to sending nothing | the configuration schema |
| 4 | a production request reads only production configuration | the configuration schema |
| 5 | the administrator multi-factor gate exists | the multi-factor service |
| 6 | every access decision is recorded | the roles guard |
| 7 | the rate limiter runs before the credential work | the rate limit guard |
| 8 | no credential material is committed | the whole `apps` tree |
| 9 | the environment example declares every required variable | the example and the schema |
| 10 | the database uses a named volume and a pinned image | the compose file |
| 11 | the quality gate is a single documented command | the package manifest |
| 12 | the published contract declares its operations | the contract |
| 13 | the published contract declares its version | the contract |
| 14 | the Prisma schema validates | the schema |
| 15 | the production dependency tree has no critical advisory | the registry |
| 16 | the development dependency tree is recorded | the registry |

## The drill's contract

The drill's behaviour is part of its contract, because a backup tool that touches the wrong
database is worse than no backup tool:

1. It **refuses** `nordhaven`, `nordhaven_integration`, and `nordhaven_e2e` **by name**.
2. It **never writes** to the database it backs up: the dump is a read.
3. It creates its **own** scratch database and drops only that one.
4. It restores with `pg_restore --exit-on-error`, so a partial restore fails loudly.
5. It compares the row counts of every business table and **fails** on any difference.
6. It records the archive's size and its SHA-256.
7. It removes its working directory.

## The probe's contract

| Measurement | Reported | Budget |
| ----------- | -------- | ------ |
| `health/live` | the median, the ninety-fifth percentile, and the maximum | 50 ms at the ninety-fifth percentile |
| `catalog/products` | the same | 250 ms |
| `catalog/products` at five-way concurrency | the same | 500 ms |
| the availability behaviour | an instance that is not ready answers **503** | the documented envelope |
| the authentication behaviour | a protected route without a credential answers **401** | the documented envelope |

The budgets are **development-machine budgets**. They are a regression guard, not a capacity
statement; a capacity statement needs the target load from HC-DEC-016, which is still open.

## What the milestone did not change

The OpenAPI contract is **unchanged** by this milestone. It added no route, no operation, and no
schema. The published document advanced from **1.2.0** to **1.3.0** during the batch because
Milestone 13 added its four administrative operations; Milestone 14 added none.
