<#
.SYNOPSIS
  Applies the Prisma migrations to the dedicated test database and checks for schema drift.
.DESCRIPTION
  Loads ONLY .env.test, validates the target with the same guard as the integration harness
  (loopback or explicitly confirmed, database name ending in _test, DATABASE_URL == DIRECT_URL),
  runs 'prisma migrate deploy' and then 'prisma migrate diff' (database vs schema.prisma).
  Nothing runs if the guard refuses the target.
.PARAMETER UseDbPush
  Only when 'migrate deploy' fails: fall back to 'prisma db push --skip-generate --accept-data-loss'
  against the validated test database. The migration files are NOT exercised in that case.
#>
param([switch]$UseDbPush)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$target = Import-TestEnvAndAssert
$node = Get-NodeExe
$prisma = Get-PrismaCli

Write-Host ''
Write-Host '== prisma migrate deploy =='
$deploy = Invoke-NativeCaptured -Exe $node -Arguments @($prisma, 'migrate', 'deploy')

if ($deploy.Code -ne 0) {
    $failing = $null
    foreach ($line in $deploy.Lines) {
        if ($line -match 'Migration name:\s*(\S+)') { $failing = $Matches[1] }
    }
    if (-not $failing) {
        foreach ($line in $deploy.Lines) {
            if ($line -match 'migration\s+`([^`]+)`\s+failed' -or $line -match 'Applying migration\s+`([^`]+)`') { $failing = $Matches[1] }
        }
    }
    Write-Host ''
    if ($failing) {
        Write-Host ("MIGRATION FAILED: {0}" -f $failing) -ForegroundColor Red
    } else {
        Write-Host 'MIGRATION FAILED (could not identify the failing migration from the output above).' -ForegroundColor Red
    }

    if (-not $UseDbPush) {
        Write-Host 'Fix the migration, or re-run with -UseDbPush to load the schema with "prisma db push" instead' -ForegroundColor Yellow
        Write-Host '(this skips the migration files entirely).' -ForegroundColor Yellow
        exit 1
    }

    Write-Host ''
    Write-Host '!!! -UseDbPush: falling back to "prisma db push --skip-generate --accept-data-loss" !!!' -ForegroundColor Yellow
    Write-Host ("!!! target: postgresql://{0}:{1}/{2}" -f $target.host, $target.port, $target.database) -ForegroundColor Yellow
    Write-Host '!!! The MIGRATION FILES WERE NOT EXERCISED; the schema comes from schema.prisma only. !!!' -ForegroundColor Yellow
    $push = Invoke-NativeCaptured -Exe $node -Arguments @($prisma, 'db', 'push', '--skip-generate', '--accept-data-loss')
    if ($push.Code -ne 0) {
        Write-Host 'db push failed too.' -ForegroundColor Red
        exit 1
    }
    Write-Host ''
    Write-Host 'Schema loaded with db push. Drift check skipped (it would be trivially clean). Migrations NOT verified.' -ForegroundColor Yellow
    exit 0
}

Write-Host ''
Write-Host '== drift check (database vs prisma/schema.prisma) =='
$diff = Invoke-NativeCaptured -Exe $node -Arguments @($prisma, 'migrate', 'diff', '--from-url', $env:DATABASE_URL, '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code')
Write-Host ''
switch ($diff.Code) {
    0 { Write-Host 'Drift check: OK - the migrated database matches prisma/schema.prisma.' -ForegroundColor Green }
    2 { Write-Host 'Drift check: DRIFT - the migrations do NOT produce prisma/schema.prisma (differences printed above).' -ForegroundColor Red; exit 2 }
    default { Write-Host ("Drift check: ERROR (prisma exit code {0}); see output above." -f $diff.Code) -ForegroundColor Red; exit 1 }
}
