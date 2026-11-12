# Milestone 03 Quickstart - Customer Profiles

Manual verification of every Milestone 03 story on Windows. The commands are Windows PowerShell 5.1
compatible: they use `;` instead of `&&`, avoid `? :` ternaries and `-SkipHttpErrorCheck`, and read
expected failures from a `try`/`catch`.

Run everything from the repository root (`D:\projects\nordhaven-commerce`).

## 1. Preconditions

- Node.js `22.23.3`, Corepack, and `pnpm@12.13.0`.
- Docker Desktop running Linux containers. If `docker` is not on `PATH`, prepend
  `C:\Users\zyad\AppData\Local\Programs\DockerDesktop\resources\bin` to `$env:Path` first.
- No root `.env` in the working tree. `scripts/check-repository-hygiene.mjs` flags any `.env*` file
  except `*.example`, so a root `.env` fails `pnpm verify`. Export variables in the session.
- The Milestone 03 migration is already applied (section 3).

```powershell
$env:Path = "C:\Users\zyad\AppData\Local\Programs\DockerDesktop\resources\bin;$env:Path"
docker compose up -d postgres
$env:DATABASE_URL = 'postgresql://nordhaven:local_only_change_me@localhost:5432/nordhaven'
node scripts/db-wait.mjs
```

## 2. Configuration

Milestone 03 introduces no new configuration key. Reuse the Milestone 02 settings; `AUTH_ENCRYPTION_KEY`
is still the only newly required secret, and it must be base64 for exactly 32 random bytes.

```powershell
$env:AUTH_ENCRYPTION_KEY = node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
$env:NODE_ENV = 'development'
$env:PORT = '3100'
$env:LOG_LEVEL = 'info'
```

## 3. Apply migrations, build, and start

```powershell
pnpm install --frozen-lockfile
pnpm prisma:generate
pnpm prisma:validate
pnpm prisma:migrate:deploy   # applies 20261019175814_customer_profiles
pnpm prisma:migrate:status   # "Database schema is up to date!"
pnpm build
pnpm start                   # keep this console running on http://localhost:3100
```

In a second console, replay the environment exports from section 2, then define the same helpers the
Milestone 02 quickstart uses:

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

## 4. Sign in as a customer

The same session model applies: customer routes accept no customer identifier, so the only scope is
the presented session. Example emails carry a per-run timestamp so the sections can be repeated
against the same database.

```powershell
$run = Get-Date -Format 'HHmmss'
$email = "quickstart.profile.$run@example.test"
$password = 'Quickstart-Passphrase-1'
Invoke-Api -Method POST -Path '/api/v1/auth/register' -Body (@{ email = $email; password = $password } | ConvertTo-Json)

$signIn = Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body (@{ email = $email; password = $password } | ConvertTo-Json))
$auth = @{ Authorization = "Bearer $($signIn.session.token)" }
```

A second customer is needed to prove isolation:

```powershell
$otherEmail = "quickstart.other.$run@example.test"
Invoke-Api -Method POST -Path '/api/v1/auth/register' -Body (@{ email = $otherEmail; password = $password } | ConvertTo-Json)
$otherAuth = @{ Authorization = "Bearer $((Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/auth/login' -Body (@{ email = $otherEmail; password = $password } | ConvertTo-Json))).session.token)" }
```

## 5. US1 - Maintain my own profile

The profile is created lazily on first read, and the payload never contains the account email or the
user identifier.

```powershell
Invoke-Api -Method GET -Path '/api/v1/customers/me/profile' -Headers $auth
# HTTP 200 {"displayName":null,"phone":null,"defaultAddressId":null,"createdAt":"...","updatedAt":"..."}

Invoke-Api -Method PATCH -Path '/api/v1/customers/me/profile' -Headers $auth -Body (@{ displayName = '  Ada Lovelace  '; phone = ' +44 20 7946 0000 ' } | ConvertTo-Json)
# HTTP 200: surrounding whitespace is trimmed at the boundary

Invoke-Api -Method PATCH -Path '/api/v1/customers/me/profile' -Headers $auth -Body (@{ phone = '   ' } | ConvertTo-Json)
# HTTP 200: an all-whitespace value clears the attribute to null

Invoke-Api -Method PATCH -Path '/api/v1/customers/me/profile' -Headers $auth -Body (@{ displayName = 'Ada'; role = 'ADMIN' } | ConvertTo-Json)
# HTTP 400 VALIDATION_ERROR; the submitted display name is not echoed back

Invoke-Api -Method GET -Path '/api/v1/customers/me/profile'
# HTTP 401 UNAUTHENTICATED without a session
```

## 6. US2 - Save and manage shipping addresses

```powershell
$address = @{
  recipientName = 'Ada Lovelace'
  line1 = '1 Analytical Engine Way'
  city = 'London'
  postalCode = 'SW1A 1AA'
  countryCode = 'gb'
}
$first = Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/customers/me/addresses' -Headers $auth -Body ($address | ConvertTo-Json))
# HTTP 201: isDefault true (the first saved address becomes the default); countryCode normalized to GB
$firstId = $first.id

$second = Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/customers/me/addresses' -Headers $auth -Body (@{ recipientName = 'Ada Lovelace'; line1 = '2 Rue de Test'; city = 'Paris'; countryCode = 'FR' } | ConvertTo-Json))
# HTTP 201: isDefault false; adding an address never changes the selection
$secondId = $second.id

Invoke-Api -Method GET -Path '/api/v1/customers/me/addresses' -Headers $auth
# HTTP 200: both addresses, in creation order, with isDefault true then false

Invoke-Api -Method PATCH -Path "/api/v1/customers/me/addresses/$secondId" -Headers $auth -Body (@{ postalCode = '75001'; region = $null } | ConvertTo-Json)
# HTTP 200: only the supplied attributes change

Invoke-Api -Method POST -Path '/api/v1/customers/me/addresses' -Headers $auth -Body (@{ recipientName = 'Ada'; line1 = '3 Nowhere'; city = 'London'; countryCode = 'GB'; isDefault = $true } | ConvertTo-Json)
# HTTP 400 VALIDATION_ERROR: a client cannot choose the default by asking for it

Invoke-Api -Method POST -Path '/api/v1/customers/me/addresses' -Headers $auth -Body (@{ recipientName = 'Ada'; line1 = '4 Nowhere'; city = 'London'; countryCode = 'GBR' } | ConvertTo-Json)
# HTTP 400 VALIDATION_ERROR: an ISO 3166-1 alpha-2 code has exactly two letters
```

## 7. US3 - Select a default address

```powershell
Invoke-Api -Method PUT -Path "/api/v1/customers/me/addresses/$secondId/default" -Headers $auth
# HTTP 200: the Paris address is now the default and the London address is not

Invoke-Api -Method GET -Path '/api/v1/customers/me/profile' -Headers $auth
# HTTP 200: defaultAddressId equals the Paris address id

Invoke-Api -Method DELETE -Path "/api/v1/customers/me/addresses/$secondId" -Headers $auth
# HTTP 204

Invoke-Api -Method GET -Path '/api/v1/customers/me/addresses' -Headers $auth
# HTTP 200: only the London address remains and isDefault is false - deleting the default clears the
# selection instead of promoting another address

Invoke-Api -Method GET -Path "/api/v1/customers/me/addresses/$secondId" -Headers $auth
# HTTP 404 ADDRESS_NOT_FOUND
```

## 8. US4 - Private by construction and auditable

Every attempt by the other customer is answered exactly like an identifier that never existed, and the
owner's data is unchanged:

```powershell
Invoke-Api -Method GET -Path "/api/v1/customers/me/addresses/$firstId" -Headers $otherAuth     # 404 ADDRESS_NOT_FOUND
Invoke-Api -Method PATCH -Path "/api/v1/customers/me/addresses/$firstId" -Headers $otherAuth -Body (@{ city = 'Stolen' } | ConvertTo-Json)   # 404 ADDRESS_NOT_FOUND
Invoke-Api -Method DELETE -Path "/api/v1/customers/me/addresses/$firstId" -Headers $otherAuth  # 404 ADDRESS_NOT_FOUND
Invoke-Api -Method PUT -Path "/api/v1/customers/me/addresses/$firstId/default" -Headers $otherAuth  # 404 ADDRESS_NOT_FOUND
Invoke-Api -Method GET -Path '/api/v1/customers/me/addresses' -Headers $otherAuth               # 200, empty list

Invoke-Api -Method GET -Path "/api/v1/customers/me/addresses/$firstId" -Headers $auth           # 200, still the owner's London address
```

An administrator is refused on every customer route, and the refusal is written to the security
audit. Provision and sign in an administrator exactly as in the Milestone 02 quickstart, then:

```powershell
Invoke-Api -Method GET -Path '/api/v1/customers/me/profile' -Headers $adminAuth   # HTTP 403 FORBIDDEN
```

The audit row itself is asserted by the automated suite rather than by a manual query: no
administrator-facing audit-read route exists, and `prisma db execute` executes without printing
rows. `test/e2e/customer.e2e.spec.ts` reads the `security_events` table directly and requires at
least one `ADMIN_ACCESS_DENIED` row after the refused call above.

Every response carries `Cache-Control: no-store` and a correlation identifier. Customer personal
attributes (display name, recipient name, street lines, city, region, postal code, phone) are not
written to the log stream, and `personal-data` redaction paths back that guarantee.

## 9. Automated coverage

The manual steps above mirror the automated suites; run them for the authoritative result:

```powershell
pnpm verify                      # format, lint, boundaries, types, unit, build, repository hygiene, OpenAPI
$env:DATABASE_URL = 'postgresql://nordhaven:local_only_change_me@localhost:5432/nordhaven_integration'
$env:NODE_ENV = 'test'
pnpm test:integration            # persistence, ownership, default-address invariants
$env:DATABASE_URL = 'postgresql://nordhaven:local_only_change_me@localhost:5432/nordhaven_e2e'
pnpm test:e2e                    # full HTTP journey, denials, rate limit, personal-data canary, live OpenAPI validation
```
