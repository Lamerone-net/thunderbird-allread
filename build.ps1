$ErrorActionPreference = "Stop"

$projectDirectory = $PSScriptRoot
$distDirectory = Join-Path $projectDirectory "dist"
$packagePath = Join-Path $distDirectory "thunderbird-allread-1.2.0.xpi"
$zipPath = Join-Path $distDirectory "thunderbird-allread-1.2.0.zip"

New-Item -ItemType Directory -Force -Path $distDirectory | Out-Null
Compress-Archive -Force -Path @(
    (Join-Path $projectDirectory "manifest.json"),
    (Join-Path $projectDirectory "background.js"),
    (Join-Path $projectDirectory "icons"),
    (Join-Path $projectDirectory "_locales")
) -DestinationPath $zipPath
Move-Item -Force -LiteralPath $zipPath -Destination $packagePath

Write-Host "Created: $packagePath"
