<#
.SYNOPSIS
  One-time (idempotent) setup of the dedicated integration-test PostgreSQL cluster.
.DESCRIPTION
  Uses the portable PostgreSQL 15 binaries in $env:GASTRUX_TEST_PG_HOME\pgsql
  (default %USERPROFILE%\gastrux-test-pg\pgsql). Creates the data directory, applies test-speed
  settings, listens only on 127.0.0.1:55432, creates the gastrux_test database and copies
  .env.test.example to .env.test when missing. Does not download anything.
#>
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

Write-Host ("Target: postgresql://{0}:{1}/{2}" -f $PgHost, $PgPort, $DbName)
Write-Host ("Root:   {0}" -f $PgRoot)

$pgCtl  = Get-PgTool 'pg_ctl'
$initdb = Get-PgTool 'initdb'
$psql   = Get-PgTool 'psql'

# 1. initdb
if (-not (Test-Path -LiteralPath (Join-Path $DataDir 'PG_VERSION'))) {
    Write-Host 'Initializing data directory...'
    New-Item -ItemType Directory -Force -Path $PgRoot | Out-Null
    [void](Invoke-Native -Echo -Exe $initdb -Arguments @('-D', $DataDir, '-U', $PgUser, '--auth=trust', '--encoding=UTF8', '--locale=C'))
} else {
    Write-Host 'Data directory already initialized.'
}

# 2. postgresql.conf overrides (managed block, replaced on every run)
$confPath = Join-Path $DataDir 'postgresql.conf'
$begin = '# >>> gastrux-test overrides (managed by scripts/test-db/setup.ps1)'
$end   = '# <<< gastrux-test overrides'
$block = @(
    $begin,
    "listen_addresses = '127.0.0.1'",
    "port = $PgPort",
    'fsync = off',
    'synchronous_commit = off',
    'full_page_writes = off',
    $end
) -join "`n"
$conf = [System.IO.File]::ReadAllText($confPath)
$existing = [regex]::Match($conf, '(?s)' + [regex]::Escape($begin) + '.*?' + [regex]::Escape($end))
if ($existing.Success) {
    $newConf = $conf.Replace($existing.Value, $block)
} else {
    $newConf = $conf.TrimEnd() + "`n`n" + $block + "`n"
}
$confChanged = ($newConf -ne $conf)
if ($confChanged) {
    [System.IO.File]::WriteAllText($confPath, $newConf, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host 'postgresql.conf overrides written (127.0.0.1 only, port 55432, fsync off).'
}

# 3. start (or restart when the configuration changed under a running server)
if (Test-PgRunning) {
    if ($confChanged) {
        Write-Host 'Configuration changed: restarting PostgreSQL...'
        [void](Invoke-Native -Echo -Exe $pgCtl -Arguments @('restart', '-D', $DataDir, '-l', $LogFile, '-w'))
    } else {
        Write-Host 'PostgreSQL already running.'
    }
} else {
    Start-TestPg
}

# 4. create the database when missing
$exists = Invoke-Native -Exe $psql -Arguments @('-h', $PgHost, '-p', "$PgPort", '-U', $PgUser, '-d', 'postgres', '-w', '-tAc', "SELECT 1 FROM pg_database WHERE datname='$DbName'")
if (("$exists").Trim() -eq '1') {
    Write-Host "Database $DbName already exists."
} else {
    Write-Host "Creating database $DbName..."
    [void](Invoke-Native -Exe $psql -Arguments @('-h', $PgHost, '-p', "$PgPort", '-U', $PgUser, '-d', 'postgres', '-w', '-v', 'ON_ERROR_STOP=1', '-c', "CREATE DATABASE $DbName"))
}

# 5. .env.test
if (-not (Test-Path -LiteralPath $EnvTest)) {
    Copy-Item -LiteralPath $EnvExample -Destination $EnvTest
    Write-Host 'Created .env.test from .env.test.example.'
} else {
    Write-Host '.env.test already exists (left untouched).'
}

Write-Host ''
Write-Host 'Done. Next: npm run test:db:migrate, then npm run test:integration.'
