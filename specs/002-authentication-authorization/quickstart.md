# Milestone 02 Quickstart - Authentication & Authorization

Manual verification of every Milestone 02 story on Windows. The commands are Windows PowerShell 5.1
compatible: they use `;` instead of `&&`, avoid `? :` ternaries and `-SkipHttpErrorCheck`, and read
expected failures from a `try`/`catch`.

Run everything from the repository root (`D:\projects\nordhaven-commerce`).

## 1. Preconditions

- Node.js `22.23.3`, Corepack, and `pnpm@12.13.0`.
- Docker Desktop running Linux containers. If `docker` is not on `PATH`, prepend
  `C:\Users\zyad\AppData\Local\Programs\DockerDesktop\resources\bin` to `$env:Path` first.
- No root `.env` in the working tree. `scripts/check-repository-hygiene.mjs` flags any `.env*` file
  except `*.example`, so a root `.env` fails `pnpm verify`. Export variables in the session, or copy
  the example outside the repository and set `DOTENV_CONFIG_PATH` to it.

```powershell
$env:Path = "C:\Users\zyad\AppData\Local\Programs\DockerDesktop\resources\bin;$env:Path"
docker compose up -d postgres
$env:DATABASE_URL = 'postgresql://nordhaven:local_only_change_me@localhost:5432/nordhaven'
node scripts/db-wait.mjs
```

## 2. Configuration and key generation

`AUTH_ENCRYPTION_KEY` is the only newly required value. Generate a local key and export it; never
commit or share it.

```powershell
$generated = node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
$env:AUTH_ENCRYPTION_KEY = $generated
$env:NODE_ENV = 'development'
$env:PORT = '3100'
$env:AUTH_MAX_FAILED_ATTEMPTS = '3'
$env:AUTH_NOTIFICATION_TRANSPORT = 'file'
$env:LOG_LEVEL = 'info'
```

`AUTH_MAX_FAILED_ATTEMPTS=3` keeps the durable-lockout step in section 9 short; the default is `10`.
`AUTH_NOTIFICATION_TRANSPORT=file` writes recovery artifacts to the ignored `tmp/notifications`
directory so the recovery story can be completed without an approved provider (HC-DEC-014).

Confirm the configuration fails closed on a bad key before continuing:

```powershell
pnpm build
$env:AUTH_ENCRYPTION_KEY = 'not-a-key'
node apps/api/dist/main.js
# exits non-zero with configuration_invalid naming AUTH_ENCRYPTION_KEY; the value is never printed
$env:AUTH_ENCRYPTION_KEY = $generated
```

## 3. Apply migrations, build, and start

```powershell
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:validate
pnpm prisma:migrate:deploy
pnpm prisma:migrate:status   # "Database schema is up to date!"
pnpm build
pnpm start                   # keep this console running on http://localhost:3100
```

In a second console, replay the environment exports from section 2, then define the helpers used by
the remaining sections:

```powershell
$base = 'http://localhost:3100'
function Invoke-Api {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$Body,
    [hashtable]$Headers
  )
  $parameters = @{ Method = $Method; Uri = "$base$Path"; UseBasicParsing = $true; ErrorAction = 'Stop' }
  if ($Body) { $parameters['Body'] = $Body; $parameters['ContentType'] = 'application/json' }
  if ($Headers) { $parameters['Headers'] = $Headers }
  try {
    $response = Invoke-WebRequest @parameters
    Write-Host "HTTP $([int]$response.StatusCode)"
    $response.Content
  } catch {
    Write-Host "HTTP $([int]$_.Exception.Response.StatusCode)"
    # Windows PowerShell 5.1: the response stream is usually already consumed, so read the error
    # body from ErrorDetails and only fall back to the stream.
    if ($_.ErrorDetails.Message) {
      $_.ErrorDetails.Message
    } elseif ($_.Exception.Response) {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $reader.ReadToEnd()
    }
  }
}
function Convert-ApiJson {
  param([string]$Content)
  return ($Content | Select-Object -Last 1 | ConvertFrom-Json)
}
```

Liveness, readiness, and the safe unauthenticated envelope:

```powershell
Invoke-Api -Method GET -Path '/api/v1/health/live'    # HTTP 200 {"status":"ok"}
Invoke-Api -Method GET -Path '/api/v1/health/ready'   # HTTP 200, database up
Invoke-Api -Method GET -Path '/api/v1/auth/principal' # HTTP 401 UNAUTHENTICATED
```

## 4. US1 - Register and sign in as a customer

Example addresses carry a per-run timestamp so the sections can be repeated against the same database
without tripping the duplicate-registration path or a rate-limit window.

```powershell
$run = Get-Date -Format 'HHmmss'
$email = "quickstart.customer.$run@example.test"
$password = 'Quickstart-Passphrase-1'
Invoke-Api -Method POST -Path '/api/v1/auth/register' -Body (@{ email = $email; password = $password } | ConvertTo-Json)
# HTTP 201: user{id,email,role:CUSTOMER,createdAt}; no password anywhere in the body

$signIn = Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body (@{ email = $email; password = $password } | ConvertTo-Json))
$token = $signIn.session.token
$auth = @{ Authorization = "Bearer $token" }
Invoke-Api -Method GET -Path '/api/v1/auth/principal' -Headers $auth           # HTTP 200, role CUSTOMER, session.current true
Invoke-Api -Method GET -Path '/api/v1/auth/sessions' -Headers $auth            # HTTP 200, one session
Invoke-Api -Method DELETE -Path '/api/v1/auth/sessions/current' -Headers $auth # HTTP 204
Invoke-Api -Method GET -Path '/api/v1/auth/principal' -Headers $auth           # HTTP 401, the credential is gone
```

## 5. US2 - Mandatory administrator MFA

```powershell
$env:OPERATOR_ADMIN_EMAIL = "quickstart.admin.$run@example.test"
$env:OPERATOR_ADMIN_PASSWORD = 'Quickstart-Admin-Passphrase-9'
node scripts/identity-create-admin.mjs --confirm
# {"event":"administrator_provisioned","id":"...","email":"...","role":"ADMIN","createdAt":"..."}
```

A password alone never yields an administrative session. Sign in, enroll, and confirm:

```powershell
$challenge = Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body (@{ email = $env:OPERATOR_ADMIN_EMAIL; password = $env:OPERATOR_ADMIN_PASSWORD } | ConvertTo-Json))
$challenge.status   # MFA_ENROLLMENT_REQUIRED
$challengeToken = $challenge.challenge.token

$enrollment = Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/auth/login/mfa/enrollment' -Body (@{ challengeToken = $challengeToken } | ConvertTo-Json))
$env:TOTP_SECRET = $enrollment.secret
$code = node -e "const t=require('./apps/api/dist/modules/identity/crypto/totp.js');console.log(t.generateTotpCode(process.env.TOTP_SECRET,t.timeStepFor(Date.now()+5000)))"

$confirmation = Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/auth/login/mfa/enrollment/confirmation' -Body (@{ challengeToken = $challengeToken; code = "$code" } | ConvertTo-Json))
$confirmation.status           # MFA_ENROLLED
$recoveryCodes = $confirmation.recoveryCodes   # ten single-use codes
```

Sign in as the administrator with a second factor and reach the administrative listing:

```powershell
$mfa = Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body (@{ email = $env:OPERATOR_ADMIN_EMAIL; password = $env:OPERATOR_ADMIN_PASSWORD } | ConvertTo-Json))
$mfa.status   # MFA_REQUIRED
Invoke-Api -Method POST -Path '/api/v1/auth/login/mfa' -Body (@{ challengeToken = $mfa.challenge.token; code = '000000' } | ConvertTo-Json)  # HTTP 401 INVALID_MFA_CODE

$adminToken = (Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/auth/login/mfa' -Body (@{ challengeToken = $mfa.challenge.token; recoveryCode = $recoveryCodes[0] } | ConvertTo-Json))).token
$adminAuth = @{ Authorization = "Bearer $adminToken" }
Invoke-Api -Method GET -Path '/api/v1/admin/users' -Headers $adminAuth   # HTTP 200
```

Reusing `$recoveryCodes[0]` fails with `INVALID_MFA_CODE`; `$recoveryCodes[1]` succeeds.

## 6. US4 - Control sessions across devices

Sign in on two "devices" and revoke exactly one of them:

```powershell
$first = (Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body (@{ email = $email; password = $password } | ConvertTo-Json))).session.token
$second = (Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body (@{ email = $email; password = $password } | ConvertTo-Json))).session.token
$firstAuth = @{ Authorization = "Bearer $first" }

$list = Convert-ApiJson (Invoke-Api -Method GET -Path '/api/v1/auth/sessions' -Headers $firstAuth)
$otherId = ($list.sessions | Where-Object { -not $_.current }).id
Invoke-Api -Method DELETE -Path "/api/v1/auth/sessions/$otherId" -Headers $firstAuth                                # HTTP 204
Invoke-Api -Method GET -Path '/api/v1/auth/principal' -Headers @{ Authorization = "Bearer $second" }                # HTTP 401, the revoked device
Invoke-Api -Method GET -Path '/api/v1/auth/principal' -Headers $firstAuth                                           # HTTP 200, the sibling survives
Invoke-Api -Method DELETE -Path '/api/v1/auth/sessions/11111111-1111-4111-8111-111111111111' -Headers $firstAuth     # HTTP 404 SESSION_NOT_FOUND
Invoke-Api -Method GET -Path '/api/v1/admin/users' -Headers $firstAuth                                              # HTTP 403 FORBIDDEN for a customer
Invoke-Api -Method DELETE -Path '/api/v1/auth/sessions' -Headers $firstAuth                                         # HTTP 204, sign out everywhere
Invoke-Api -Method GET -Path '/api/v1/auth/principal' -Headers $firstAuth                                           # HTTP 401
```

## 7. US3 - Recover a lost password

```powershell
$other = (Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body (@{ email = $email; password = $password } | ConvertTo-Json))).session.token
Invoke-Api -Method POST -Path '/api/v1/auth/password-reset/requests' -Body (@{ email = $email } | ConvertTo-Json)                     # HTTP 202 ACCEPTED
Invoke-Api -Method POST -Path '/api/v1/auth/password-reset/requests' -Body (@{ email = 'nobody@example.test' } | ConvertTo-Json)      # identical 202, nothing delivered

$artifact = Get-ChildItem apps/api/tmp/notifications, tmp/notifications -Filter '*password_reset.json' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime | Select-Object -Last 1
$notificationBody = (Get-Content -LiteralPath $artifact.FullName -Raw | ConvertFrom-Json).body
$recoveryToken = [regex]::Match($notificationBody, '([A-Za-z0-9_-]{43})$').Groups[1].Value

$newPassword = 'Quickstart-Replacement-2'
Invoke-Api -Method POST -Path '/api/v1/auth/password-reset/confirmations' -Body (@{ token = $recoveryToken; newPassword = $newPassword } | ConvertTo-Json)  # HTTP 204
Invoke-Api -Method GET -Path '/api/v1/auth/principal' -Headers @{ Authorization = "Bearer $other" }                     # HTTP 401, prior sessions revoked
Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body (@{ email = $email; password = $password } | ConvertTo-Json)   # HTTP 401, the old password is gone
Invoke-Api -Method POST -Path '/api/v1/auth/password-reset/confirmations' -Body (@{ token = $recoveryToken; newPassword = 'Another-Passphrase-3' } | ConvertTo-Json)  # HTTP 400 INVALID_RECOVERY_TOKEN
```

## 8. Password change and uniform sign-in failures

```powershell
$current = (Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body (@{ email = $email; password = $newPassword } | ConvertTo-Json))).session.token
$currentAuth = @{ Authorization = "Bearer $current" }
Invoke-Api -Method POST -Path '/api/v1/auth/password' -Headers $currentAuth -Body (@{ currentPassword = 'Wrong-Passphrase-9'; newPassword = 'Final-Passphrase-4' } | ConvertTo-Json)  # HTTP 401 INVALID_CREDENTIALS
Invoke-Api -Method POST -Path '/api/v1/auth/password' -Headers $currentAuth -Body (@{ currentPassword = $newPassword; newPassword = 'Final-Passphrase-4' } | ConvertTo-Json)         # HTTP 204

Invoke-Api -Method POST -Path '/api/v1/auth/register' -Body (@{ email = "uniform.$run@example.test"; password = 'Uniform-Passphrase-1' } | ConvertTo-Json)          # HTTP 201
Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body (@{ email = 'absent@example.test'; password = 'Wrong-Passphrase-9' } | ConvertTo-Json)                    # HTTP 401 INVALID_CREDENTIALS
Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body (@{ email = "uniform.$run@example.test"; password = 'Wrong-Passphrase-9' } | ConvertTo-Json)              # identical 401 body apart from the per-request correlationId
```

## 9. US5 - Abuse resistance, lockout, and 503-before-401

Rate limits return `429` with a numeric `Retry-After`. The registration policy allows five attempts
per client and address within its window:

```powershell
1..5 | ForEach-Object { Invoke-Api -Method POST -Path '/api/v1/auth/register' -Body (@{ email = "rate.limit.$run@example.test"; password = 'short' } | ConvertTo-Json) | Out-Null }
Invoke-Api -Method POST -Path '/api/v1/auth/register' -Body (@{ email = "rate.limit.$run@example.test"; password = 'short' } | ConvertTo-Json)
# HTTP 429 RATE_LIMITED with Retry-After
```

Durable lockout (with `AUTH_MAX_FAILED_ATTEMPTS=3` exported as in section 2):

```powershell
Invoke-Api -Method POST -Path '/api/v1/auth/register' -Body (@{ email = "lockout.$run@example.test"; password = 'Lockout-Passphrase-1' } | ConvertTo-Json)   # HTTP 201
1..3 | ForEach-Object { Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body (@{ email = "lockout.$run@example.test"; password = 'Wrong-Passphrase-9' } | ConvertTo-Json) | Out-Null }
Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body (@{ email = "lockout.$run@example.test"; password = 'Lockout-Passphrase-1' } | ConvertTo-Json)
# still HTTP 401 INVALID_CREDENTIALS: the lock is indistinguishable from a wrong password
```

The lock is stored in the database, so it survives a restart. `503` is reported before `401` while
the instance is not ready:

```powershell
docker compose stop postgres
Invoke-Api -Method GET -Path '/api/v1/health/ready'    # HTTP 503; readiness marks the instance not ready
Invoke-Api -Method GET -Path '/api/v1/auth/principal'  # HTTP 503 SERVICE_UNAVAILABLE (never 401)
docker compose start postgres
node scripts/db-wait.mjs
Invoke-Api -Method GET -Path '/api/v1/health/ready'    # HTTP 200 once a fresh probe succeeds
```

The rate-limit counters are process-local and reset on restart; the durable lock is the security
control that outlives the process.

## 10. Contract and quality gates

```powershell
pnpm openapi:check      # inventory, security metadata, observed responses, and drift
pnpm verify             # format, lint, boundaries, types, unit, build, hygiene, OpenAPI
```

Database-backed suites require their own isolated database and `NODE_ENV=test`:

```powershell
$env:NODE_ENV = 'test'
$env:DATABASE_URL = 'postgresql://nordhaven:local_only_change_me@localhost:5432/nordhaven_integration'
pnpm prisma:migrate:deploy ; pnpm prisma:migrate:status ; pnpm test:integration
$env:DATABASE_URL = 'postgresql://nordhaven:local_only_change_me@localhost:5432/nordhaven_e2e'
pnpm prisma:migrate:deploy ; pnpm prisma:migrate:status ; pnpm test:e2e ; pnpm test:process
```

## 11. Stop the API

Press `Ctrl+C` in the API console and confirm the graceful shutdown logs end at `STOPPED`. Leave
PostgreSQL running, or stop it without deleting its volume:

```powershell
docker compose stop postgres
```

Never run `docker compose down -v`, `prisma migrate reset`, or `prisma db push`.
