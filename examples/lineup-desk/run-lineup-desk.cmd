@echo off
REM Double-click me: serves the lineup-desk plain-HTML example on http://localhost:3000
REM Navigate to repo root so ../../sdk/dist is accessible by the static server.
cd /d "%~dp0..\.."
if not exist "sdk\dist\airz-sdk.global.min.js" call npm run build:sdk
echo.
echo   lineup-desk  -^>  http://localhost:3000/examples/lineup-desk/
echo.
start "" http://localhost:3000/examples/lineup-desk/
call npx --yes serve . -l 3000
