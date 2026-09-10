# One-click launcher for the airZ web-SDK examples.
# Builds the workspace libs (@airz/rundown-sdk + @airz/config-ui), then starts
# every example in its own PowerShell window. Close a window (Ctrl+C) to stop it.

$root = $PSScriptRoot
Set-Location $root

Write-Host "Building SDK libs (sdk + config-ui)..." -ForegroundColor Cyan
& npm run build:libs
if ($LASTEXITCODE -ne 0) { Write-Host "Lib build failed - fix the error above, then re-run." -ForegroundColor Red; exit 1 }

function Start-Example([string]$title, [string]$command) {
  Start-Process powershell -ArgumentList @(
    "-NoExit", "-Command",
    "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location '$root'; $command"
  )
}

# Vite apps (each on its own fixed port from its vite.config.ts)
Start-Example "election-2023 :5181" "npm run dev --workspace election-2023"
Start-Example "election-desk :5180" "npm run dev --workspace election-desk"
# Plain-HTML examples (interactive, lineup-desk) served statically from the repo root
Start-Example "static (plain HTML) :3000" "npx --yes serve . -l 3000"

Write-Host ""
Write-Host "Examples launching in separate windows:" -ForegroundColor Green
Write-Host "  election-2023   ->  http://localhost:5181"
Write-Host "  election-desk   ->  http://localhost:5180"
Write-Host "  lineup-desk     ->  http://localhost:3000/examples/lineup-desk/"
Write-Host "  interactive     ->  http://localhost:3000/examples/interactive/interactive.html?debug=1"
Write-Host ""
Write-Host "(First run of the static server downloads 'serve' via npx - give it a few seconds.)"
Write-Host "Close each window with Ctrl+C to stop that server."
