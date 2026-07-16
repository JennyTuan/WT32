param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$pythonPath = Join-Path $repoRoot ".venv\Scripts\python.exe"
$frontendRoot = Join-Path $repoRoot "ui-review"

if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw "Python virtual environment was not found at $pythonPath"
}

function Assert-LastCommandSucceeded {
    param([string]$StepName)

    if ($LASTEXITCODE -ne 0) {
        throw "$StepName failed with exit code $LASTEXITCODE"
    }
}

Push-Location $repoRoot
try {
    Write-Host "Running backend tests..."
    & $pythonPath -m unittest discover -s backend\tests
    Assert-LastCommandSucceeded "Backend tests"

    Push-Location $frontendRoot
    try {
        Write-Host "Running frontend tests..."
        & npm.cmd run test
        Assert-LastCommandSucceeded "Frontend tests"

        Write-Host "Running frontend lint..."
        & npm.cmd run lint
        Assert-LastCommandSucceeded "Frontend lint"

        if (-not $SkipBuild) {
            Write-Host "Running frontend production build..."
            & npm.cmd run build
            Assert-LastCommandSucceeded "Frontend build"
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    Pop-Location
}

Write-Host "WT32 verification completed successfully."
