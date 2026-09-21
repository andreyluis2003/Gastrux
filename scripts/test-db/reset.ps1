<#
.SYNOPSIS
  Drops and recreates the dedicated test database, then applies the migrations.
.DESCRIPTION
  Refuses unless .env.test passes the SAME guard as the integration harness AND points at the
  portable cluster (127.0.0.1:55432). Never touches any other server.
.PARAMETER UseDbPush
  Passed to migrate.ps1 (fallback to db push when a migration fails; migrations NOT exercised).
#>
param([switch]$UseDbPush)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$target = Import-TestEnvAndAssert -RequireLocalCluster
$psql = Get-PgTool 'psql'
$db = $target.database

Start-TestPg

$common = @('-h', $PgHost, '-p', "$PgPort", '-U', $PgUser, '-d', 'postgres', '-w', '-v', 'ON_ERROR_STOP=1')
Write-Host ("Dropping database {0}..." -f $db)
[void](Invoke-Native -Exe $psql -Arguments ($common + @('-c', "DROP DATABASE IF EXISTS $db WITH (FORCE)")))
Write-Host ("Creating database {0}..." -f $db)
[void](Invoke-Native -Exe $psql -Arguments ($common + @('-c', "CREATE DATABASE $db")))

Write-Host ''
& (Join-Path $PSScriptRoot 'migrate.ps1') -UseDbPush:$UseDbPush
exit $LASTEXITCODE
