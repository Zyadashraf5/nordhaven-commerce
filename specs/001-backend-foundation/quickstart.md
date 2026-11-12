# Quickstart and Acceptance Guide: Backend Foundation

**Feature**: `001-backend-foundation`  
**Status**: Planning artifact. These commands and files are implementation acceptance targets; they do not exist merely because this plan exists.

## 1. Supported local environment

### Windows and PowerShell

> **Acceptance platform decisions (Product Owner)**:
>
> - **2026-10-18**: Windows 11 acceptance approved for milestone acceptance, replacing the
>   Windows 10 manual smoke test.
> - **2026-10-19 (operative)**: Windows 10 Pro 22H2 x64 build 19045.6466 on this machine is
>   approved as the Milestone 01 local acceptance environment. Windows 11 is not required for
>   Milestone 01 and the 2026-10-18 substitution is withdrawn. PowerShell 7 is not installed on
>   this host, so Windows PowerShell 5.1-compatible commands (documented below) are approved for
>   the acceptance run.
>
> Acceptance evidence (T044) therefore comes from this Windows 10 host. No Windows 11 testing was
> performed or is claimed.

The original local-development target was Windows 10 22H2 x64 (build 19045) on a still-serviced ESU or LTSC installation, with:

- PowerShell 7 or later;
- Node.js `22.23.3` and Corepack;
- `pnpm@12.13.0`;
- hardware virtualization and SLAT enabled;
- WSL `2.1.5` or later;
- Docker Desktop using Linux containers and Docker Compose v2; and
- at least 8 GB system RAM available for the supported Docker Desktop configuration.

Windows 11 is recommended for a longer support horizon. CI on `windows-latest` verifies PowerShell, path, and Compose compatibility, but it does not replace the required manual smoke test on a qualifying Windows 10 host.

Verify prerequisites in PowerShell:

```powershell
Get-ComputerInfo | Select-Object WindowsProductName, WindowsVersion, OsBuildNumber, OsArchitecture
$PSVersionTable.PSVersion
wsl --version
node --version
corepack --version
pnpm --version
docker version
docker info --format '{{.OSType}}'
docker compose version
docker compose config --quiet
```

Expected checks include Node `v22.23.3`, pnpm `12.13.0`, Compose v2, and Docker reporting `linux` containers. Docker Desktop must be running before database commands are used.

### PowerShell 5.1 compatibility (approved 2026-10-19)

PowerShell 7 (`pwsh`) is not installed on the approved acceptance host. Execute the command
blocks below with Windows PowerShell 5.1, replacing every `-SkipHttpErrorCheck` assertion with
this equivalent, which captures a non-2xx response instead of terminating:

```powershell
try {
  $resp = Invoke-WebRequest -Uri $Uri -UseBasicParsing
} catch {
  $resp = $_.Exception.Response
}
[int]$resp.StatusCode
```

### Linux CI/development

Use Node.js `22.23.3`, `pnpm@12.13.0`, Docker Engine, and Docker Compose v2. The committed lockfile and version pins are authoritative.

## 2. First local start

After implementation, the intended workflow is:

```powershell
Copy-Item -LiteralPath .env.example -Destination .env
corepack enable
pnpm install --frozen-lockfile
docker compose config --quiet
pnpm db:up
pnpm db:wait
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm dev
```

The example environment file must contain local placeholders only. Never commit `.env` or real credentials. Startup must fail before binding the HTTP port if critical configuration is invalid or the initial database probe cannot succeed within five seconds.

## 3. Healthy application checks

With the application running on its documented local port (planned default `3000`):

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/v1/health/live
Invoke-RestMethod -Uri http://localhost:3000/api/v1/health/ready
Invoke-WebRequest -Uri http://localhost:3000/api/docs -UseBasicParsing
Invoke-RestMethod -Uri http://localhost:3000/api/docs-json
```

Expected results:

- liveness returns HTTP 200 with `{"status":"ok"}`;
- readiness returns HTTP 200 with database status `up`;
- Swagger UI and generated OpenAPI JSON are accessible; and
- the generated contract exposes only the two versioned health paths in this milestone.

## 4. Database failure and recovery

First verify normal readiness, then stop only the local PostgreSQL service:

```powershell
docker compose stop postgres
$ready = Invoke-WebRequest -Uri http://localhost:3000/api/v1/health/ready -SkipHttpErrorCheck
$live = Invoke-WebRequest -Uri http://localhost:3000/api/v1/health/live -SkipHttpErrorCheck
$ready.StatusCode
$live.StatusCode
```

On Windows PowerShell 5.1, substitute the try/catch equivalent from section 1 for each
`-SkipHttpErrorCheck` request.

Readiness must return 503 within two seconds with the safe error schema; liveness must remain 200. A deployment or load balancer must route traffic using readiness, never liveness. No production routing infrastructure is delivered by this milestone.

Restore the database and verify automatic recovery:

```powershell
docker compose start postgres
pnpm db:wait
Invoke-RestMethod -Uri http://localhost:3000/api/v1/health/ready
```

Initial startup and runtime outage are distinct policies. To verify fail-fast initial startup, stop
PostgreSQL before starting the application. The process must exit non-zero within the bounded
startup window and must not listen on the HTTP port. Only a database outage that occurs after a
successful startup keeps liveness healthy while readiness returns 503 until a fresh probe succeeds.

## 5. Safe errors and contract verification

```powershell
$missing = Invoke-WebRequest -Uri http://localhost:3000/api/v1/not-a-route -SkipHttpErrorCheck
$missing.StatusCode
$missing.Content
pnpm openapi:check
```

On Windows PowerShell 5.1, use the try/catch equivalent from section 1 to capture the 404 status
and body.

The unknown route must return 404 with the safe error envelope and a correlation identifier, without stack traces, SQL, credentials, or internal paths. `openapi:check` must regenerate the document, validate it structurally, reject drift from the committed canonical JSON, enforce the health-only path allowlist, and validate observed 200, 404, and 503 responses against the contract.

## 6. Configuration and shutdown checks

- Remove or corrupt each critical environment value in a disposable local `.env`, one at a time. Startup must exit non-zero with a useful but non-secret validation message.
- Start the application and press Ctrl+C. It must stop accepting work, close HTTP and database resources, flush logs, and exit within the configured grace period.
- CI must additionally exercise the SIGTERM path on Linux, because Ctrl+C is not an exact substitute for an orchestrator termination signal.

## 7. Migration workflow

Create migrations locally only through the reviewable create-first workflow:

```powershell
pnpm prisma:migrate:create --name descriptive_change
pnpm prisma:validate
pnpm prisma:migrate:dev
pnpm prisma:migrate:status
```

CI, tests, and deployment-like environments use reviewed migrations only:

```powershell
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm prisma:migrate:status
```

Running deployment twice must be harmless. `prisma db push`, automatic migrations during application startup, and destructive reset commands are not part of the normal workflow. Any local reset command must verify that the target database has an explicitly permitted test/development name before acting.

## 8. Quality and test verification

```powershell
pnpm format:check
pnpm lint
pnpm boundaries:check
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm openapi:check
pnpm build
pnpm audit --prod --audit-level critical
```

Unit tests run without PostgreSQL and may run in parallel. Integration and E2E suites use separate dedicated databases, apply reviewed migrations, and run serially. Safety guards must refuse system, default, production-like, or non-allowlisted database names.

The boundary check must include one allowed public-module import fixture and one forbidden private cross-module import fixture; CI passes only when the former is accepted and the latter is rejected.

## 9. Local cleanup

```powershell
pnpm db:down
```

This stops the local stack without deleting its volume. Removing local volumes or resetting a database is destructive and must be an explicit, separately named action protected by the environment and database-name guards.

## 10. Windows acceptance record

> **Operative decision (2026-10-19)**: The Product Owner approved this machine — Windows 10 Pro
> 22H2 x64, build 19045.6466 — as the Milestone 01 local acceptance environment. Windows 11 is
> not required and the 2026-10-18 Windows 11 substitution is withdrawn; both decisions are
> recorded in section 1 for traceability. PowerShell 7 is not installed on this host, so Windows
> PowerShell 5.1-compatible commands (section 1) are approved for the acceptance run. Authority:
> Product Owner; approval date: 2026-10-19.

Before milestone acceptance, record the following from the qualifying acceptance machine:

| Evidence | Required result | Recorded result (2026-10-19) |
|---|---|---|
| Edition, release, build, servicing status | Windows 10 22H2 x64 build 19045 approved as the acceptance host (supersedes the serviced-release requirement) | Windows 10 Pro 22H2 x64 build 19045.6466 (registry-confirmed); standard support ended 2025-10-14 — host explicitly approved by the Product Owner on 2026-10-19 |
| PowerShell version | 7 or later; 5.1-compatible commands approved for this host | Windows PowerShell 5.1; PowerShell 7-only parameters replaced by the documented section 1 equivalents |
| Node and pnpm | `22.23.3` and `12.13.0` | `v22.23.3`; `pnpm 12.13.0` via Corepack 0.36.0 |
| WSL, Docker, Compose | WSL >= 2.1.5, Linux containers, Compose v2 | WSL 3.0.1.0; Docker Desktop 29.8.2 client/server, Linux containers; Compose v5.6.0 |
| Compose validation and PostgreSQL start | Pass | PASS — `docker compose config --quiet` and PostgreSQL start succeeded in all three verification passes |
| Install, generate, migration, dev start | Pass | PASS — frozen install, `prisma generate`/`validate`, `migrate deploy` twice + status on both test databases, dev start with probes |
| Liveness/readiness/degraded recovery | Expected 200/200, then 200/503, then recovery | PASS — live 200 / ready 200 (DB `up`); after `docker compose stop postgres` ready 503 in 21 ms with live still 200; after `docker compose start postgres` ready 200 |
| Full quality command set | Pass | PASS — format, lint, boundaries, typecheck, unit 35/35, integration 3/3, E2E 5/5, process 4 passed + 1 documented win32 skip, `openapi:check`, build, `audit --prod` 0 known vulnerabilities |
| Safe failure states | Unknown route returns the safe 404 envelope with correlation ID; fail-fast startup diagnostics | PASS — 404 with `x-correlation-id` and the safe envelope (contract-asserted by the E2E suite); categorized startup diagnostics covered by the process suite |

Failure of this smoke test blocks milestone acceptance and must be documented; it does not justify silently dropping the platform support requirement.
