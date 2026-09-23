# Shared helpers for the dedicated integration-test database scripts.
# Dot-source this file: . (Join-Path $PSScriptRoot '_common.ps1')
# Windows PowerShell 5.1 compatible. Keep this file ASCII-only.

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location -LiteralPath $RepoRoot

if ($env:GASTRUX_TEST_PG_HOME) { $PgRoot = $env:GASTRUX_TEST_PG_HOME } else { $PgRoot = Join-Path $env:USERPROFILE 'gastrux-test-pg' }
$PgBin      = Join-Path $PgRoot 'pgsql\bin'
$DataDir    = Join-Path $PgRoot 'data'
$LogFile    = Join-Path $PgRoot 'postgres.log'
$EnvTest    = Join-Path $RepoRoot '.env.test'
$EnvExample = Join-Path $RepoRoot '.env.test.example'

# The one cluster these scripts manage. reset.ps1 refuses to touch anything else.
$PgHost = '127.0.0.1'
$PgPort = 55432
$PgUser = 'postgres'
$DbName = 'gastrux_test'

$ZipHelp = @"
Portable PostgreSQL 15 binaries not found at: $PgBin
Download the "Windows x86-64" PostgreSQL 15 .zip from
  https://www.enterprisedb.com/download-postgresql-binaries
and extract it so that this file exists:
  $PgBin\pg_ctl.exe
(or set GASTRUX_TEST_PG_HOME to another root that contains pgsql\bin).
"@

function Get-PgTool {
    param([Parameter(Mandatory = $true)][string]$Name)
    $path = Join-Path $PgBin ($Name + '.exe')
    if (-not (Test-Path -LiteralPath $path)) {
        Write-Host $ZipHelp
        throw "Missing $path"
    }
    return $path
}

# Runs a native command; throws on a non-zero exit code. Returns stdout lines (-Echo also prints them).
function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$Exe,
        [string[]]$Arguments = @(),
        [switch]$Echo
    )
    $result = & $Exe @Arguments
    if ($Echo) { $result | Out-Host }
    if ($LASTEXITCODE -ne 0) {
        throw ("{0} failed with exit code {1}" -f [System.IO.Path]::GetFileName($Exe), $LASTEXITCODE)
    }
    return $result
}

# Runs a native command capturing stdout+stderr as text lines without tripping
# $ErrorActionPreference='Stop' (Windows PowerShell 5.1 wraps stderr in ErrorRecords).
# Lines are echoed live. Returns @{ Code; Lines }.
function Invoke-NativeCaptured {
    param(
        [Parameter(Mandatory = $true)][string]$Exe,
        [string[]]$Arguments = @()
    )
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $lines = & $Exe @Arguments 2>&1 | ForEach-Object {
            $text = "$_"
            Write-Host $text
            $text
        }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    return [pscustomobject]@{ Code = $code; Lines = @($lines) }
}

# Node entry points (avoids .cmd shims and quoting problems).
function Get-NodeExe {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $cmd) { throw 'node was not found on PATH.' }
    return $cmd.Source
}

function Get-PrismaCli {
    $p = Join-Path $RepoRoot 'node_modules\prisma\build\index.js'
    if (-not (Test-Path -LiteralPath $p)) { throw "Prisma CLI not found at $p (run npm install)." }
    return $p
}

function Get-TsxCli {
    $p = Join-Path $RepoRoot 'node_modules\tsx\dist\cli.mjs'
    if (-not (Test-Path -LiteralPath $p)) { throw "tsx not found at $p (run npm install)." }
    return $p
}

# Parses a dotenv-style file into a hashtable (KEY=VALUE, optional quotes, # comments).
function Read-EnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    $map = @{}
    foreach ($line in (Get-Content -LiteralPath $Path)) {
        $t = $line.Trim()
        if ($t -eq '' -or $t.StartsWith('#')) { continue }
        if ($t -match '^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $key = $Matches[1]
            $value = $Matches[2].Trim()
            if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
                $value = $value.Substring(1, $value.Length - 2)
            } else {
                $value = ($value -replace '\s+#.*$', '')
            }
            $map[$key] = $value
        }
    }
    return $map
}

# Loads .env.test (ONLY that file, never .env) into this process' environment,
# overriding anything the shell provided, then validates the target with the same
# TypeScript guard as the integration harness. Returns the validated target object
# (host, port, database). Throws when the target is not a dedicated test database.
function Import-TestEnvAndAssert {
    param([switch]$RequireLocalCluster)

    if (-not (Test-Path -LiteralPath $EnvTest)) {
        throw ".env.test not found at $EnvTest. Run 'npm run test:db:setup' (or copy .env.test.example to .env.test)."
    }
    $map = Read-EnvFile -Path $EnvTest
    if (-not $map.ContainsKey('DATABASE_URL')) { throw '.env.test does not define DATABASE_URL.' }
    foreach ($key in @('DATABASE_URL', 'DIRECT_URL', 'INTEGRATION_DB_CONFIRM')) {
        if ($map.ContainsKey($key)) { Set-Item -Path ("Env:" + $key) -Value $map[$key] }
    }
    # Prisma also reads .env (which may point at a remote database) for any variable that is
    # missing from the process environment, so make DIRECT_URL explicit.
    if (-not $map.ContainsKey('DIRECT_URL')) { $env:DIRECT_URL = $env:DATABASE_URL }

    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & (Get-NodeExe) (Get-TsxCli) 'scripts/test-db/check-target.ts'
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    if ($code -ne 0) {
        throw 'Target REFUSED by the dedicated-test-database guard (see message above). Nothing was touched.'
    }
    $target = (($out | Select-Object -Last 1) | ConvertFrom-Json)

    Write-Host ("Target: postgresql://{0}:{1}/{2}" -f $target.host, $target.port, $target.database)

    if ($RequireLocalCluster) {
        $isLocal = ($target.host -eq $PgHost -or $target.host -eq 'localhost') -and ([string]$target.port -eq [string]$PgPort)
        if (-not $isLocal) {
            throw ("Refusing: this script only manages the portable cluster on {0}:{1}, but the target is {2}:{3}." -f $PgHost, $PgPort, $target.host, $target.port)
        }
        if ($target.database -notmatch '^[a-z0-9_]+_test$') {
            throw ("Refusing: database name '{0}' must match ^[a-z0-9_]+_test$ for reset." -f $target.database)
        }
    }
    return $target
}

function Test-PgRunning {
    $pgCtl = Get-PgTool 'pg_ctl'
    if (-not (Test-Path -LiteralPath (Join-Path $DataDir 'PG_VERSION'))) { return $false }
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $pgCtl status -D $DataDir *> $null
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previous
    }
    return ($code -eq 0)
}

function Start-TestPg {
    if (-not (Test-Path -LiteralPath (Join-Path $DataDir 'PG_VERSION'))) {
        throw "No data directory at $DataDir. Run 'npm run test:db:setup' first."
    }
    if (Test-PgRunning) {
        Write-Host ("PostgreSQL already running on {0}:{1}." -f $PgHost, $PgPort)
        return
    }
    $pgCtl = Get-PgTool 'pg_ctl'
    Write-Host ("Starting PostgreSQL on {0}:{1} (log: {2})" -f $PgHost, $PgPort, $LogFile)
    Invoke-PgCtlDetached -Arguments @('start', '-D', $DataDir, '-l', $LogFile, '-w')
    if (-not (Test-PgRunning)) { throw "PostgreSQL did not start. See $LogFile" }
}

# pg_ctl start/restart leave the server process holding the caller's stdout: capturing that output
# (`$x = & pg_ctl ...`) never returns. Run it with no redirection in a hidden window instead.
function Invoke-PgCtlDetached {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)
    $pgCtl = Get-PgTool 'pg_ctl'
    $quoted = ($Arguments | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join ' '
    $p = Start-Process -FilePath $pgCtl -ArgumentList $quoted -WindowStyle Hidden -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw ("pg_ctl {0} failed with exit code {1}. See {2}" -f $Arguments[0], $p.ExitCode, $LogFile) }
}
