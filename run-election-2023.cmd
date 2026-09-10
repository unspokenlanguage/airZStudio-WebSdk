@echo off
REM Double-click me: runs the election-2023 example (Vite) on http://localhost:5181
cd /d "%~dp0"
if not exist "sdk\dist\index.js" call npm run build:libs
if not exist "packages\config-ui\dist\index.js" call npm run build:libs
echo.
echo   election-2023  -^>  http://localhost:5181  (opens automatically)
echo.
call npm run dev --workspace election-2023 -- --open
