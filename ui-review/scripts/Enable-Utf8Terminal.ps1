$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)

[Console]::InputEncoding = $Utf8NoBom
[Console]::OutputEncoding = $Utf8NoBom
$OutputEncoding = $Utf8NoBom

$env:PYTHONIOENCODING = "utf-8"
$env:LANG = "en_US.UTF-8"
$env:LC_ALL = "en_US.UTF-8"

chcp 65001 > $null

Write-Host "Terminal encoding is now UTF-8."
Write-Host "InputEncoding : $([Console]::InputEncoding.WebName)"
Write-Host "OutputEncoding: $([Console]::OutputEncoding.WebName)"
Write-Host "Code page     : $((chcp) -replace '[^0-9]', '')"

Write-Host ""
Write-Host "Run this before using Codex CLI in this shell:"
Write-Host "  . .\\scripts\\Enable-Utf8Terminal.ps1"
