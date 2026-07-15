param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$extensionRoot = Join-Path $projectRoot "extension"
$manifestPath = Join-Path $extensionRoot "manifest.json"

if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "Missing extension/manifest.json"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$version = [string]$manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+(\.\d+)?$') {
    throw "Manifest version is not valid for Chrome: $version"
}

$forbiddenNames = @('*.har', 'roster*.json', 'heroes*.json', '*.pem', '*.key')
foreach ($pattern in $forbiddenNames) {
    $match = Get-ChildItem -LiteralPath $extensionRoot -Recurse -File -Filter $pattern | Select-Object -First 1
    if ($match) { throw "Refusing to package sensitive file: $($match.FullName)" }
}

$textFiles = Get-ChildItem -LiteralPath $extensionRoot -Recurse -File |
    Where-Object { $_.Extension -in @('.js', '.json', '.html', '.css', '.md') }
$secretPattern = 'auth_key|session_id|access_token|csrf-token|user_hash|-----BEGIN [A-Z ]+PRIVATE KEY-----'
foreach ($file in $textFiles) {
    if (Select-String -LiteralPath $file.FullName -Pattern $secretPattern -Quiet) {
        throw "Potential credential material found in $($file.FullName)"
    }
}

$distRoot = Join-Path $projectRoot "dist"
$stageRoot = Join-Path $distRoot "unpacked"
$zipPath = Join-Path $distRoot "hero-wars-snapshot-$version.zip"

if (Test-Path -LiteralPath $stageRoot) { Remove-Item -LiteralPath $stageRoot -Recurse -Force }
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
Copy-Item -Path (Join-Path $extensionRoot '*') -Destination $stageRoot -Recurse -Force
Compress-Archive -Path (Join-Path $stageRoot '*') -DestinationPath $zipPath -CompressionLevel Optimal

Write-Host "Created $zipPath"
