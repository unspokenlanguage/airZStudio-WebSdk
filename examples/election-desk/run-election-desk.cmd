@echo off
REM Double-click me: runs the election-desk example (Vite) on http://localhost:5180
REM Navigate to repo root so the npm workspace + shared libs resolve.
cd /d "%~dp0..\.."
if not exist "sdk\dist\index.js" call npm run build:libs
if not exist "packages\config-ui\dist\index.js" call npm run build:libs
echo.
echo   election-desk  -^>  http://localhost:5180  (opens automatically; simulation starts on load)
echo.
call npm run dev --workspace election-desk -- --open
