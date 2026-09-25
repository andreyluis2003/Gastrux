<# Shows whether the dedicated integration-test PostgreSQL is running. Exit code 0 = running, 1 = not. #>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

Write-Host ("Target: postgresql://{0}:{1}/{2}" -f $PgHost, $PgPort, $DbName)
Write-Host ("Root:   {0}" -f $PgRoot)
if (-not (Test-Path -LiteralPath (Join-Path $PgBin 'pg_ctl.exe'))) {
    Write-Host 'Binaries: NOT FOUND (run npm run test:db:setup for instructions)'
    exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $DataDir 'PG_VERSION'))) {
    Write-Host 'Data directory: not initialized (run npm run test:db:setup)'
    exit 1
}
if (Test-PgRunning) {
    Write-Host 'Status: RUNNING'
    $isReady = Get-PgTool 'pg_isready'
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $isReady -h $PgHost -p "$PgPort" } finally { $ErrorActionPreference = $previous }
    exit 0
}
Write-Host 'Status: STOPPED (run npm run test:db:start)'
exit 1
