$ErrorActionPreference = "Stop"

$projectDirectory = $PSScriptRoot
$distDirectory = Join-Path $projectDirectory "dist"
$packagePath = Join-Path $distDirectory "thunderbird-allread-1.3.0.xpi"
$zipPath = Join-Path $distDirectory "thunderbird-allread-1.3.0.zip"

New-Item -ItemType Directory -Force -Path $distDirectory | Out-Null
if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath
}

Push-Location $projectDirectory
try {
    & tar.exe -a -c -f $zipPath `
        manifest.json `
        background.js `
        options.html `
        options.css `
        options.js `
        icons `
        _locales
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to create the extension archive (tar exit code $LASTEXITCODE)."
    }
} finally {
    Pop-Location
}
Move-Item -Force -LiteralPath $zipPath -Destination $packagePath

Write-Host "Created: $packagePath"
