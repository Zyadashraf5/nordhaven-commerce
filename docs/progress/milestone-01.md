# Milestone 01 - Backend Foundation Verification Record

**Checkpoint date**: 2026-10-19  
**Task state**: 44 of 44 tasks complete; T037, T042, and T044 closed on 2026-10-19  
**Overall state**: All local Milestone 01 acceptance criteria satisfied; hosted CI evidence remains
NOT VERIFIED pending an approved initial commit

This record distinguishes commands executed during the final acceptance session (2026-10-19) from
historical results. No commit, push, deployment, database reset, volume deletion, commerce module,
constitution change, or `HC-DEC-*` resolution was performed. PowerShell 7 was not installed and no
optional software was added to the host.

## Acceptance platform decisions (Product Owner)

- **2026-10-18**: Windows 11 acceptance approved for milestone acceptance, replacing the
  Windows 10 manual smoke test. (Recorded in `quickstart.md` section 1 and `plan.md`
  M01-TECH-003; retained for traceability.)
- **2026-10-19 (operative)**: Windows 10 Pro 22H2 x64 build 19045.6466 on this machine is
  approved as the Milestone 01 local acceptance environment. Windows 11 is **not** required for
  Milestone 01 and the 2026-10-18 substitution is withdrawn. Windows PowerShell 5.1-compatible
  commands are approved for the acceptance run because PowerShell 7 is not installed.
- Reconciled documents: `quickstart.md` sections 1 and 10 (decision chain plus the completed
  Windows acceptance record with recorded evidence), `plan.md` Target Platform note and
  M01-TECH-003 row. Original planning text was retained for traceability.
- **No Windows 11 evidence exists or is claimed.** T044 evidence comes solely from this
  Windows 10 host.

## Host evidence (2026-10-19)

| Item             | Actual value                                                                                                                                                                                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Operating system | Windows 10 Pro 22H2 x64, build 19045.6466 (registry-confirmed; not Windows 11)                                                                                                                                                                                     |
| PowerShell       | Windows PowerShell 5.1; `pwsh` (PowerShell 7) not installed — approved section 1 equivalents used in place of `-SkipHttpErrorCheck`                                                                                                                                |
| Node.js          | `v22.23.3`                                                                                                                                                                                                                                                         |
| Corepack / pnpm  | `0.36.0` / `12.13.0` via Corepack shims in `%APPDATA%\npm` (enabled without admin rights)                                                                                                                                                                          |
| WSL              | `3.0.1.0` (requirement: >= 2.1.5)                                                                                                                                                                                                                                  |
| Docker           | Docker Desktop `29.8.2` client and server, Linux containers, Compose `v5.6.0`; user-level install, not on PATH — sessions prepend `C:\Users\zyad\AppData\Local\Programs\DockerDesktop\resources\bin` (also required for `docker-credential-desktop` during builds) |
| PostgreSQL       | `postgres:18.6-alpine` container `nordhaven-commerce-postgres-1`, named volume `nordhaven-commerce_nordhaven-postgres` mounted at `/var/lib/postgresql` — preserved through the 2026-10-19 power outage                                                            |
| Databases        | dev `nordhaven`; test `nordhaven_integration` and `nordhaven_e2e` (created only when absent; never reset)                                                                                                                                                          |
| Project path     | `D:\projects\nordhaven-commerce` (relocated from the retired `E:\development` host; all commands below are portable)                                                                                                                                               |

## Three final verification passes (T037)

The recorded pass sequence was executed by a PowerShell runner script
(`%TEMP%\m01-run-passes.ps1`) that writes one log per step
(`%TEMP%\m01-pass<N>-<step>.log`) and a status file (`%TEMP%\m01-passes.status`). Each pass runs:
frozen install → `prisma:generate` → `prisma:validate` → `migrate:deploy` twice + `migrate:status`
(integration DB) → `test:integration` → `migrate:deploy` twice + `migrate:status` (E2E DB) →
`test:e2e` → `test:process` → `pnpm verify` (format, lint, boundaries, typecheck, unit, build,
repository hygiene, OpenAPI) → `docker compose config --quiet` → `audit:prod` → runtime image
build.

| Pass        | Result                                   | Elapsed time | Evidence                                                                   |
| ----------- | ---------------------------------------- | ------------ | -------------------------------------------------------------------------- |
| 1           | COMPLETE                                 | 3.5 min      | all 13 steps exit 0; image tagged `nordhaven-api:m01-pass-1`               |
| 2           | COMPLETE                                 | 2.8 min      | all 13 steps exit 0; image tagged `nordhaven-api:m01-pass-2`               |
| 3           | COMPLETE                                 | 2.7 min      | all 13 steps exit 0; image tagged `nordhaven-api:m01-pass-3`               |
| Status file | `ALL THREE VERIFICATION PASSES COMPLETE` | —            | every pass finished well inside the documented 15-minute CI bound per pass |

Verified content of pass 3 logs (passes 1 and 2 have identical step structure and per-step logs):

- Integration suite: 1 suite, **3/3 tests passed**
- E2E suite: 2 suites, **5/5 tests passed**
- Process suite: **4 passed + 1 skipped** — the skip is the POSIX SIGTERM case, conditionally
  excluded on `win32` (see D2 below); Linux CI enforces it
- Composite `pnpm verify`: format, lint, boundaries, typecheck, unit (11 suites, **35/35**),
  build, hygiene, and OpenAPI all passed ("All composite verification categories passed",
  "OpenAPI validation and drift check passed")
- `prisma:migrate:status`: "Database schema is up to date!" on both test databases
- `audit:prod`: "No known vulnerabilities found"
- `docker compose config --quiet`: exit 0
- Docker runtime build completed and tagged

### Power outage interruption and recovery (2026-10-19)

An earlier run on 2026-10-19 completed pass 1 (3.4 min) and was interrupted during pass 2's
migrate step when a power outage shut down the machine. Per the acceptance rules, the interrupted
pass was treated as FAILED/INTERRUPTED (`%TEMP%\m01-passes.status` read
`FAILED pass2 mig-int1`), never counted, and the three-pass count was restarted at pass 1 because
T037 does not authorize retaining a pass across an interruption.

- **Cause**: power loss at approximately 13:00 local. PostgreSQL logs show a clean
  "received fast shutdown request" with exit code 0 and `OOMKilled=false` — Windows shut down
  gracefully and Docker Desktop stopped the container. This was an external interruption, not a
  backend defect.
- **Recovery verified after reboot**: Docker 29.8.2 back up; the same container (same volume, no
  recreation) returned to `Up (healthy)`; all three databases present; `_prisma_migrations` shows
  `00000000000000_foundation` fully applied with `finished_at` set on both test databases (the
  outage landed between passes, not mid-migration); `node scripts/db-wait.mjs` and
  `prisma:migrate:status` both passed before resuming; code edits, `.env` absence (hygiene gate),
  and `node_modules` all intact.
- No destructive action, volume deletion, or database reset was performed at any point.

## Check-by-check results (T042)

All commands run from `D:\projects\nordhaven-commerce` on the approved Windows 10 host. "×4"
means baseline plus each of the three final passes.

| Check                                                  | Command                                                     | Result                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen-lockfile install                                | `pnpm install --frozen-lockfile`                            | PASS ×4 — lockfile unchanged, supply-chain verification passed, no version changes                                                                                                                                          |
| Prisma generation                                      | `pnpm prisma:generate`                                      | PASS ×4 — `DATABASE_URL` exported in-session (no root `.env` by design)                                                                                                                                                     |
| Prisma validation                                      | `pnpm prisma:validate`                                      | PASS ×4 — schema valid, no business model                                                                                                                                                                                   |
| Migration deploy twice + status                        | `pnpm prisma:migrate:deploy` / `pnpm prisma:migrate:status` | PASS ×4 on both test databases (second deploy harmless) and on the dev database                                                                                                                                             |
| Formatting                                             | `pnpm format:check`                                         | PASS ×4                                                                                                                                                                                                                     |
| ESLint                                                 | `pnpm lint`                                                 | PASS ×4 — zero warnings/errors                                                                                                                                                                                              |
| Module boundaries                                      | `pnpm boundaries:check`                                     | PASS ×4                                                                                                                                                                                                                     |
| TypeScript                                             | `pnpm typecheck`                                            | PASS ×4                                                                                                                                                                                                                     |
| Unit tests                                             | `pnpm test:unit`                                            | PASS ×4 — 11 suites, 35/35 tests                                                                                                                                                                                            |
| Integration tests (real PostgreSQL)                    | `pnpm test:integration`                                     | PASS ×4 — 3/3 tests                                                                                                                                                                                                         |
| E2E tests                                              | `pnpm test:e2e`                                             | PASS ×4 — 5/5 tests                                                                                                                                                                                                         |
| Process suite                                          | `pnpm test:process`                                         | PASS ×4 — 4 passed + 1 win32-conditional skip (documented below)                                                                                                                                                            |
| Build                                                  | `pnpm build`                                                | PASS ×4 — Nest build                                                                                                                                                                                                        |
| OpenAPI generation/drift/allowlist/response validation | `pnpm openapi:check`                                        | PASS ×4                                                                                                                                                                                                                     |
| Repository hygiene                                     | included in `pnpm verify`                                   | PASS ×4 — no `.env`, no excluded module, no secret canary                                                                                                                                                                   |
| Composite gate                                         | `pnpm verify`                                               | PASS ×4 — stops on first failed category                                                                                                                                                                                    |
| Production dependency audit                            | `pnpm audit --prod --audit-level critical`                  | PASS ×4 — 0 known vulnerabilities                                                                                                                                                                                           |
| Compose definition                                     | `docker compose config --quiet`                             | PASS ×4                                                                                                                                                                                                                     |
| Docker runtime image                                   | `docker build --file apps/api/Dockerfile ...`               | PASS — baseline `nordhaven-api:m01` (407 MB) plus `nordhaven-api:m01-pass-1/2/3`; build-target image `nordhaven-api-build:m01` (1.49 GB) also built                                                                         |
| Docker daemon/runtime                                  | `docker compose up -d postgres`, container health           | PASS — healthy before, during, and after the three passes                                                                                                                                                                   |
| Hosted Linux/Windows CI                                | hosted run of `.github/workflows/ci.yml` / `windows.yml`    | **NOT VERIFIED** — the repository has zero commits; an initial commit requires Product Owner approval                                                                                                                       |
| Local manual SIGTERM/Ctrl+C console step               | quickstart section 6                                        | **NOT VERIFIED manually** — an automated session cannot deliver a console Ctrl+C; the graceful close sequence is unit-tested (`SHUTTING_DOWN` → `STOPPED`, Prisma disconnect) and the SIGTERM process case runs in Linux CI |

## Runtime smoke test on the approved Windows 10 host (T044)

Quickstart sections 2–6 executed on 2026-10-19 against `http://localhost:3000` with
Windows PowerShell 5.1-compatible commands:

| Step                                                                                    | Result                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose config --quiet`, `docker compose up -d postgres`, `pnpm db:wait`        | PASS — PostgreSQL healthy, "PostgreSQL is ready."                                                                                                                                                                                                                    |
| `pnpm prisma:generate`, `pnpm prisma:migrate:deploy`, `pnpm dev` (first-start workflow) | PASS — startup completed and bound only after the initial DB probe succeeded                                                                                                                                                                                         |
| `GET /api/v1/health/live`                                                               | **200** — `{"status":"ok"}`                                                                                                                                                                                                                                          |
| `GET /api/v1/health/ready`                                                              | **200** — `{"status":"ok","checks":{"database":"up"}}`                                                                                                                                                                                                               |
| `GET /api/docs` (Swagger UI)                                                            | **200**                                                                                                                                                                                                                                                              |
| `GET /api/docs-json`                                                                    | **200** — exposes exactly `/api/v1/health/live` and `/api/v1/health/ready`                                                                                                                                                                                           |
| `GET /api/v1/not-a-route`                                                               | **404** with `x-correlation-id` response header; safe envelope (message + correlation ID, no stack/SQL/credentials/paths) contract-asserted by the E2E suite — the PS 5.1 stream capture returned an empty body, recorded as a capture limitation, not an API defect |
| Database outage: `docker compose stop postgres` → readiness                             | **503 in 21 ms** (bound: 2 s) with the safe error schema; liveness stayed **200**                                                                                                                                                                                    |
| Recovery: `docker compose start postgres` → readiness                                   | **200**                                                                                                                                                                                                                                                              |
| Fail-fast startup with unavailable DB; invalid configuration                            | PASS via process suite — non-zero exit before binding the port, categorized diagnostics, no secrets or supplied values serialized                                                                                                                                    |
| Full quality command set (quickstart section 8)                                         | PASS — see T042 table                                                                                                                                                                                                                                                |
| Manual Ctrl+C graceful stop (quickstart section 6)                                      | **NOT VERIFIED manually** — recorded above; covered by unit tests and the Linux CI SIGTERM case                                                                                                                                                                      |

Deviations from the original quickstart, both approved by the Product Owner on 2026-10-19 and
recorded in `quickstart.md` sections 1 and 10: Windows PowerShell 5.1 instead of PowerShell 7
(approved compatible commands), and this Windows 10 Pro 22H2 build 19045.6466 host instead of the
withdrawn Windows 11 substitution.

## Defects found and fixed in this session

| ID  | Defect                                                                                                                                                                                                            | Fix                                                                                                                                     | Verification                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| D1  | Port-conflict process test failed on Windows: a loopback-only or IPv6 squatter did not conflict with the application's `listen(port, '0.0.0.0')` bind (Windows permits overlapping binds across address families) | Squatter now binds `0.0.0.0` — the same address family as `apps/api/src/main.ts` — and the child process is reaped in a `finally` block | Process suite passes; no production code changed |
| D2  | SIGTERM process test is not representable on Windows: `child.kill('SIGTERM')` is an unconditional `TerminateProcess`                                                                                              | Platform-conditional skip on `win32` (`itSignal`), enforced by Linux CI, equivalent coverage in the unit suite                          | Documented skip: 4 passed + 1 skipped on Windows |
| D3  | Prettier formatting violation introduced by the D2 spec edit                                                                                                                                                      | `pnpm exec prettier --write`; call semantics verified intact (re-wrap only); pass count restarted from 1                                | `format:check` green in all three final passes   |

The gate catching D3 — and the pass count restart it forced — is recorded as evidence that the
quality gates work as designed.

## Environment and workflow findings (no production code changed)

- **F1 — root `.env` vs repository hygiene**: the README's safe-local-start instructions tell
  developers to create a root `.env`, but `scripts/check-repository-hygiene.mjs` flags any `.env`
  in the working tree. The session-created `.env` was removed and `DATABASE_URL` exported
  in-session rather than weakening the gate. Recommend a Product Owner decision to align the README
  and the hygiene rule (create `.env` locally, keep it ignored/allowed, or document the export flow).
- **F2 — Docker not on PATH**: user-level Docker Desktop install requires prepending
  `...\DockerDesktop\resources\bin` in each session; builds additionally need
  `docker-credential-desktop` from that directory.
- **F3 — pnpm via Corepack shims**: `corepack enable` wrote shims to `%APPDATA%\npm` (already on
  the user PATH, non-admin). New shells resolve `pnpm`; existing session shells need the PATH prepend.
- **F4 — `prisma.config.ts` requires `DATABASE_URL`**: it loads `dotenv/config` and calls
  `env('DATABASE_URL')`, so bare `pnpm prisma:generate` fails when no root `.env` exists (by
  design, per F1). The runner exports `DATABASE_URL` before generate.
- **F5 — background runner console deadlock**: an inline background PowerShell run hung silently
  due to console-inheritance deadlock; resolved by running a script file with stdin redirected
  from `NUL`. Tooling issue only; not a project defect.
- **F6 — PowerShell 5.1 gaps**: no `-SkipHttpErrorCheck` (use try/catch) and pipelines can
  corrupt `$LASTEXITCODE` (capture exit codes via file redirection). Documented in
  `quickstart.md` section 1.

## Remediation completed in the 2026-10-18 session (historical)

- Corrected the nonexistent `pnpm db:migrate:deploy` command in the plan and quickstart to
  `pnpm prisma:migrate:deploy`.
- Reconciled the implementation plan, research, quickstart, OpenAPI planning contract, contract
  verification guide, manifests, CI definitions, and actual project layout.
- Added categorized safe startup diagnostics for invalid configuration, unavailable PostgreSQL,
  port conflicts, and otherwise unclassified initialization failures. Diagnostics never serialize
  supplied values, exception messages, database URLs, or credentials.
- Loaded the documented local `.env` file before configuration validation and added a process
  regression test using an isolated temporary directory.
- Added protected unexpected-error logging with the same correlation ID returned to the client.
- Added a global Zod-backed Nest request-validation convention. Validation errors contain safe paths
  and generic messages, never rejected values.
- Added captured structured-log redaction tests with injected synthetic passwords, tokens,
  authorization/cookie values, and a database URL.
- Added a controlled `500` E2E case through a test-only application-factory interceptor. No test or
  commerce route was added to the production API.
- Added OpenAPI `500` responses and verified the planning YAML and generated JSON are semantically
  identical. The OpenAPI gate now scans path, operation, tag, and schema names for excluded domains.
- Replaced the boundary fixture string/regex check with one shared algorithm used for production
  source and both fixtures; public module-root imports pass and private deep imports fail.
- Expanded integration coverage for migration status, repeated deployment, a real toggleable TCP
  outage/recovery path, and session-isolated temporary database state.
- Strengthened shutdown coverage: unit evidence verifies readiness enters `SHUTTING_DOWN` before
  drain/close, database shutdown invokes Prisma disconnect, and the process test rejects post-signal
  requests while retaining the ten-second bound.
- Removed unused `@nestjs/config`, declared CLI/test dependencies in their owning workspace, and
  regenerated the lockfile without changing approved runtime versions.
- Preserved `postgres:18.6-alpine` and the named-volume destination `/var/lib/postgresql`.

## Checks executed in the 2026-10-18 remediation session (historical, retired host)

> Historical record from the previous machine. The `E:\pnpm-store` store-dir overrides below were
> arguments of that retired host and do not exist on the current host; current runs use plain
> `pnpm install --frozen-lockfile` (see the T042 table above).

| Check                                               | Result                    | Evidence                                                                                                                                       |
| --------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Dependency resolution after manifest reconciliation | PASS                      | `corepack pnpm@12.13.0 install --offline --store-dir E:\pnpm-store` (retired host); existing local packages only                               |
| Frozen-lockfile install                             | PASS                      | `corepack pnpm@12.13.0 install --frozen-lockfile --store-dir E:\pnpm-store` (retired host); lockfile and supply-chain policy passed            |
| Formatting                                          | PASS                      | `pnpm format:check`; all matched files passed                                                                                                  |
| ESLint                                              | PASS                      | `pnpm lint`; zero warnings/errors                                                                                                              |
| Module boundaries                                   | PASS                      | `pnpm boundaries:check`; production and fixture algorithm passed                                                                               |
| TypeScript                                          | PASS                      | `pnpm typecheck`; root/test and API strict configurations passed                                                                               |
| Build                                               | PASS                      | `pnpm build`; Nest build passed                                                                                                                |
| Prisma generation                                   | PASS                      | `pnpm prisma:generate`; Prisma Client generated                                                                                                |
| Prisma validation                                   | PASS                      | `pnpm prisma:validate`; schema valid and contains no business model                                                                            |
| Unit tests                                          | PASS                      | `pnpm test:unit`; 11 suites and 35 tests passed                                                                                                |
| E2E tests not requiring real PostgreSQL             | PASS                      | `pnpm test:e2e`; 2 suites and 5 tests passed, including controlled 500 and captured-log assertions                                             |
| Database-independent process tests                  | PASS                      | Jest process selection for unavailable DB, invalid configuration, and local `.env`; 3 tests passed                                             |
| Full process suite                                  | NOT VERIFIED (historical) | Required the dedicated E2E PostgreSQL database — now executed: see T042                                                                        |
| Integration suite                                   | NOT VERIFIED (historical) | Docker/PostgreSQL unavailable after remediation — now executed: see T042                                                                       |
| Migration deploy twice/status                       | NOT VERIFIED (historical) | Not rerun on that baseline — now executed: see T042                                                                                            |
| OpenAPI generation/check                            | PASS                      | `pnpm openapi:generate` and `pnpm openapi:check`; structural validation, drift, inventory, excluded-name scan, and observed 200/404/503 passed |
| Planning YAML/generated JSON reconciliation         | PASS                      | Read-only parser comparison reported semantic identity                                                                                         |
| Composite gate                                      | PASS                      | `pnpm verify`; format, lint, boundaries, types, unit, build, hygiene, and OpenAPI all passed                                                   |
| Compose definition                                  | PASS                      | `docker compose config --quiet`; exit 0                                                                                                        |
| Docker daemon/runtime                               | NOT VERIFIED (historical) | One `docker compose ps` attempt produced no output for 10 seconds — now executed: see T042                                                     |
| Docker images                                       | NOT VERIFIED (historical) | Daemon unavailable — now executed: see T042                                                                                                    |
| Production dependency audit                         | PASS                      | `pnpm audit --prod --audit-level critical`; no known vulnerabilities found                                                                     |
| Repository hygiene                                  | PASS                      | Included in `pnpm verify`; no excluded module or secret canary found                                                                           |
| Hosted Linux/Windows CI                             | NOT VERIFIED              | Workflow definitions were updated, but no hosted run was fabricated or claimed — still NOT VERIFIED                                            |
| Windows 10 manual acceptance                        | NOT VERIFIED (historical) | Recorded against the retired host (Windows 11 24H2/build 26100, no `pwsh`) — now executed on the approved Windows 10 host: see T044            |

An attempted frozen **offline** install on the retired host failed only because pnpm's
supply-chain policy metadata for one package was not cached (`ERR_PNPM_NO_OFFLINE_META`). The
normal frozen install with advisory metadata access then passed. This was not a lockfile or
package-resolution failure.

## Historical evidence retained for context

Before the remediation session, real PostgreSQL integration, E2E, startup, shutdown, repeated
migration, runtime outage/recovery, named-volume inspection, and Linux container tests had passed.
Those runs preceded the final dependency override and were historical only. The pre-outage run of
2026-10-19 (pass 1 COMPLETE in 3.4 min, pass 2 interrupted by the power outage) is likewise
retained as historical evidence and was **not** counted toward T037.

## Safe host commands (portable, current host)

Run these from `D:\projects\nordhaven-commerce` with Docker Desktop running (Linux containers).
If `docker` is not on PATH, prepend
`C:\Users\zyad\AppData\Local\Programs\DockerDesktop\resources\bin` to `$env:Path` first.
They create the two isolated test databases only when absent and never reset a database or
delete a volume. Do not run `docker compose down -v`, Prisma reset, or `prisma db push`.

```powershell
docker compose ps
docker compose up -d postgres

$databases = @('nordhaven_integration', 'nordhaven_e2e')
foreach ($database in $databases) {
  $exists = docker compose exec -T postgres psql -U nordhaven -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='$database';"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  if ($exists -ne '1') {
    docker compose exec -T postgres createdb -U nordhaven $database
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  }
}

docker build --file apps/api/Dockerfile --tag nordhaven-api:m01 .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
docker build --target build --file apps/api/Dockerfile --tag nordhaven-api-build:m01 .
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
```

After both image builds succeed, run this complete pass three consecutive times. If a command
fails, fix it and restart the count at pass 1. Note that `DATABASE_URL` must be exported before
`prisma:generate` because `prisma.config.ts` requires it and no root `.env` is permitted by the
hygiene gate.

```powershell
for ($pass = 1; $pass -le 3; $pass++) {
  Write-Host "Milestone 01 final verification pass $pass of 3"

  pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  $env:DATABASE_URL = 'postgresql://nordhaven:local_only_change_me@localhost:5432/nordhaven_integration?schema=public'
  pnpm prisma:generate
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  pnpm prisma:validate
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  pnpm prisma:migrate:deploy
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  pnpm prisma:migrate:deploy
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  pnpm prisma:migrate:status
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $env:NODE_ENV = 'test'
  pnpm test:integration
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  $env:DATABASE_URL = 'postgresql://nordhaven:local_only_change_me@localhost:5432/nordhaven_e2e?schema=public'
  $env:DATABASE_URL_E2E = $env:DATABASE_URL
  $env:PORT = '3000'
  $env:LOG_LEVEL = 'silent'
  $env:DATABASE_STARTUP_TIMEOUT_MS = '5000'
  $env:DATABASE_PROBE_TIMEOUT_MS = '1000'
  $env:SHUTDOWN_TIMEOUT_MS = '8000'
  pnpm prisma:migrate:deploy
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  pnpm prisma:migrate:deploy
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  pnpm prisma:migrate:status
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  pnpm test:e2e
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  pnpm test:process
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  pnpm verify
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  docker compose config --quiet
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  pnpm audit:prod
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  docker build --file apps/api/Dockerfile --tag "nordhaven-api:m01-pass-$pass" .
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

This is the exact sequence the recorded runner executed for the three final passes (delivered as
a script file with stdin redirected from `NUL` to avoid background console-inheritance deadlock,
with one log per step). After the loop, remove only the temporary process environment variables
from the current shell if desired.

## Outstanding acceptance conditions

1. **Hosted CI evidence (NOT VERIFIED)**: obtain actual hosted results for
   `.github/workflows/ci.yml` and `windows.yml` from a committed revision. The repository
   currently has zero commits, and the initial commit requires Product Owner approval (no
   commit/push without approval). Local passes are not hosted CI. Alternatively, the Product
   Owner may record a waiver accepting the three local passes as final evidence — this decision
   is outstanding.
2. ~~Windows acceptance platform~~ — **closed 2026-10-19**: this Windows 10 Pro 22H2 build
   19045.6466 host approved; smoke test executed and recorded above (T044).
3. ~~Three complete verification passes~~ — **closed 2026-10-19**: 3/3 consecutive passes
   completed within the CI bound (T037).

## Acceptance conclusion

All local Milestone 01 acceptance criteria are satisfied: **44 of 44 tasks complete**, three
consecutive verification passes recorded (T037), every listed check executed and recorded
(T042), and the Windows 10 manual smoke test executed on the Product Owner-approved host
(T044). No genuine code, security, database, or architecture defect remains open; the defects
found during verification (D1–D3) were fixed in small batches and the pass count restarted as
required.

The single remaining acceptance condition is administrative: hosted CI evidence needs either an
approved initial commit or a recorded waiver.

**Exact next action**: obtain the Product Owner's approval to create the initial git commit of
the current baseline (or record the hosted-CI waiver). After that decision and this report,
Milestone 02 (Authentication & Authorization) implementation may begin. Do not commit or push
before approval.
