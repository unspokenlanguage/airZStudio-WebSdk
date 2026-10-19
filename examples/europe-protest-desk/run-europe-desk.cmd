@echo off
REM Double-click me: serves the Europe protest-map producer desk on http://localhost:3000
REM Navigate to repo root so ../../sdk/dist is accessible by the static server.
cd /d "%~dp0..\.."
if not exist "sdk\dist\airz-sdk.global.min.js" call npm run build:sdk
echo.
echo   europe-protest-desk  -^>  http://localhost:3000/examples/europe-protest-desk/
echo.
start "" http://localhost:3000/examples/europe-protest-desk/
call npx --yes serve . -l 3000
