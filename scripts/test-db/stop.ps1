<# Stops the dedicated integration-test PostgreSQL (fast shutdown). Idempotent. #>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

Write-Host ("Target: postgresql://{0}:{1}/{2}" -f $PgHost, $PgPort, $DbName)
$pgCtl = Get-PgTool 'pg_ctl'
if (-not (Test-PgRunning)) {
    Write-Host 'PostgreSQL is not running.'
    exit 0
}
[void](Invoke-Native -Echo -Exe $pgCtl -Arguments @('stop', '-D', $DataDir, '-m', 'fast', '-w'))
Write-Host 'Stopped.'
