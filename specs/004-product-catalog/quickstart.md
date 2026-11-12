# Milestone 04 Quickstart - Product Catalog

Manual verification of every Milestone 04 story on Windows. The commands are Windows PowerShell 5.1
compatible: they use `;` instead of `&&`, avoid `? :` ternaries and `-SkipHttpErrorCheck`, and read
expected failures from a `try`/`catch`.

Run everything from the repository root (`D:\projects\nordhaven-commerce`).

## 1. Preconditions

- Node.js `22.23.3`, Corepack, and `pnpm@12.13.0`.
- Docker Desktop running Linux containers. If `docker` is not on `PATH`, prepend
  `C:\Users\zyad\AppData\Local\Programs\DockerDesktop\resources\bin` to `$env:Path` first.
- No root `.env` in the working tree. `scripts/check-repository-hygiene.mjs` flags any `.env*` file
  except `*.example`, so a root `.env` fails `pnpm verify`. Export variables in the session.
- The Milestone 04 migration (`20261019214516_product_catalog`) is already applied (section 3).

```powershell
$env:Path = "C:\Users\zyad\AppData\Local\Programs\DockerDesktop\resources\bin;$env:Path"
docker compose up -d postgres
$env:DATABASE_URL = 'postgresql://nordhaven:local_only_change_me@localhost:5432/nordhaven'
node scripts/db-wait.mjs
```

## 2. Configuration

Milestone 04 introduces no new configuration key and no new dependency. Reuse the Milestone 02
settings; `AUTH_ENCRYPTION_KEY` remains the only required secret and must be base64 for exactly 32
random bytes.

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
pnpm prisma:migrate:deploy   # applies 20261019214516_product_catalog
pnpm prisma:migrate:status   # "Database schema is up to date!"
pnpm build
pnpm start                   # keep this console running on http://localhost:3100
```

In a second console, replay the environment exports from section 2, then define the same helpers the
earlier quickstarts use:

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

## 4. Story 1 - an administrator builds the catalog

Provision an administrator, complete the mandatory second factor (MFA enrollment, then verification
with a recovery code, exactly as the identity quickstart), and capture the session token in
`$adminToken`.

```powershell
# Create the first root category.
$body = '{"name":"Living Room"}'
$root = Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/admin/catalog/categories' -Body $body -Headers @{ Authorization = "Bearer $adminToken" })
# Expected: HTTP 201, slug "living-room", parentId null.

# Nest one level.
$body = "{`"name`":`"Sofas`",`"parentId`":`"$($root.id)`"}"
$child = Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/admin/catalog/categories' -Body $body -Headers @{ Authorization = "Bearer $adminToken" })
# Expected: HTTP 201, parentId = $root.id.

# A third level is refused with 409 CATALOG_CONFLICT.
$body = "{`"name`":`"Corner Sofas`",`"parentId`":`"$($child.id)`"}"
Invoke-Api -Method POST -Path '/api/v1/admin/catalog/categories' -Body $body -Headers @{ Authorization = "Bearer $adminToken" }

# Create a brand.
$brand = Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/admin/catalog/brands' -Body '{"name":"Northwind"}' -Headers @{ Authorization = "Bearer $adminToken" })
# Expected: HTTP 201, slug "northwind".

# Create a product with an exact base price.
$body = "{`"name`":`"Oak Dining Table`",`"description`":`"Solid oak dining table.`",`"categoryId`":`"$($root.id)`",`"brandId`":`"$($brand.id)`",`"basePriceMinor`":129900,`"baseCurrency`":`"gbp`"}"
$product = Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/admin/catalog/products' -Body $body -Headers @{ Authorization = "Bearer $adminToken" })
# Expected: HTTP 201, status "DRAFT", baseCurrency "GBP", basePriceMinor 129900.

# Add images as a whole collection.
$body = '{"images":[{"url":"https://cdn.example.com/a.jpg","position":1},{"url":"https://cdn.example.com/b.jpg","altText":"Side view","position":0}]}'
Invoke-Api -Method PUT -Path "/api/v1/admin/catalog/products/$($product.id)/images" -Body $body -Headers @{ Authorization = "Bearer $adminToken" }
# Expected: HTTP 200, images ordered by position.

# Add attributes as a whole collection.
$body = '{"attributes":[{"name":"Material","value":"Oak","position":0}]}'
Invoke-Api -Method PUT -Path "/api/v1/admin/catalog/products/$($product.id)/attributes" -Body $body -Headers @{ Authorization = "Bearer $adminToken" }
# Expected: HTTP 200.

# Add a sellable variant; the SKU is normalized to upper case.
$body = '{"sku":" oak-table-01 ","color":"Oak"}'
$variant = Convert-ApiJson (Invoke-Api -Method POST -Path "/api/v1/admin/catalog/products/$($product.id)/variants" -Body $body -Headers @{ Authorization = "Bearer $adminToken" })
# Expected: HTTP 201, sku "OAK-TABLE-01".

# Publish it.
$body = '{"status":"PUBLISHED"}'
Invoke-Api -Method PUT -Path "/api/v1/admin/catalog/products/$($product.id)/status" -Body $body -Headers @{ Authorization = "Bearer $adminToken" }
# Expected: HTTP 200, status "PUBLISHED".
```

## 5. Story 2 - a shopper browses anonymously

No credential is sent on any call in this section.

```powershell
Invoke-Api -Method GET -Path '/api/v1/catalog/products'
# Expected: HTTP 200; the published product appears under items.

Invoke-Api -Method GET -Path '/api/v1/catalog/products/oak-dining-table'
# Expected: HTTP 200; status "PUBLISHED"; variants carry "OAK-TABLE-01".

Invoke-Api -Method GET -Path '/api/v1/catalog/categories'
# Expected: HTTP 200; one root ("living-room") with child "sofas".

Invoke-Api -Method GET -Path '/api/v1/catalog/brands'
# Expected: HTTP 200; "northwind".
```

## 6. Story 3 - the browsing surface never discloses unpublished work

```powershell
# Create a draft product with a variant but never publish it.
$body = "{`"name`":`"Secret Bench`",`"description`":`"Draft.`",`"categoryId`":`"$($root.id)`",`"brandId`":`"$($brand.id)`",`"basePriceMinor`":5000,`"baseCurrency`":`"GBP`"}"
$draft = Convert-ApiJson (Invoke-Api -Method POST -Path '/api/v1/admin/catalog/products' -Body $body -Headers @{ Authorization = "Bearer $adminToken" })
$body = '{"sku":"SECRET-BENCH-01"}'
Invoke-Api -Method POST -Path "/api/v1/admin/catalog/products/$($draft.id)/variants" -Body $body -Headers @{ Authorization = "Bearer $adminToken" }

# The draft is absent from the public list.
Invoke-Api -Method GET -Path '/api/v1/catalog/products'

# The draft slug and a never-existing slug answer identically.
Invoke-Api -Method GET -Path '/api/v1/catalog/products/secret-bench'
Invoke-Api -Method GET -Path '/api/v1/catalog/products/no-such-product'
# Expected: both HTTP 404 PRODUCT_NOT_FOUND with the same message.
```

## 7. Story 4 - contract, validation, and authorization rules hold

```powershell
# An anonymous administrative call is denied.
Invoke-Api -Method GET -Path '/api/v1/admin/catalog/categories'
# Expected: HTTP 401 UNAUTHENTICATED.

# A duplicate SKU is a conflict, not a silent overwrite.
$body = '{"sku":"oak-table-01"}'
Invoke-Api -Method POST -Path "/api/v1/admin/catalog/products/$($draft.id)/variants" -Body $body -Headers @{ Authorization = "Bearer $adminToken" }
# Expected: HTTP 409 CATALOG_CONFLICT.

# An unknown field is rejected without echoing the value.
$body = "{`"name`":`"Desk`",`"description`":`"x`",`"categoryId`":`"$($root.id)`",`"brandId`":`"$($brand.id)`",`"basePriceMinor`":100,`"baseCurrency`":`"GBP`",`"inventory`":5}"
Invoke-Api -Method POST -Path '/api/v1/admin/catalog/products' -Body $body -Headers @{ Authorization = "Bearer $adminToken" }
# Expected: HTTP 400 VALIDATION_ERROR, without the submitted name in the body.

# A fractional price is rejected.
$body = '{"basePriceMinor":12.5}'
Invoke-Api -Method PATCH -Path "/api/v1/admin/catalog/products/$($product.id)" -Body $body -Headers @{ Authorization = "Bearer $adminToken" }
# Expected: HTTP 400 VALIDATION_ERROR.

# Publishing a product that has no variant is refused.
Invoke-Api -Method PUT -Path "/api/v1/admin/catalog/products/$($draft.id)/status" -Body '{"status":"PUBLISHED"}' -Headers @{ Authorization = "Bearer $adminToken" }
# Expected: HTTP 409 CATALOG_CONFLICT.
```

## 8. Expected result

- Every administrative route requires the `ADMIN` role; only the four `/api/v1/catalog/*` reads are
  anonymous.
- Categories form a two-level tree; a third level is `409 CATALOG_CONFLICT`.
- A product is born `DRAFT`, is invisible while unpublished, and cannot be published without a variant.
- Prices are exact integers of minor units with a three-letter currency; a fractional amount is refused.
- Images and attributes are replaced as whole collections; a variant is managed individually.
- Every response carries `Cache-Control: no-store` and an `X-Correlation-ID` that matches the error
  envelope's `correlationId`.
