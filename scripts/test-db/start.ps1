<# Starts the dedicated integration-test PostgreSQL (127.0.0.1:55432). Idempotent. #>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

Write-Host ("Target: postgresql://{0}:{1}/{2}" -f $PgHost, $PgPort, $DbName)
Start-TestPg
