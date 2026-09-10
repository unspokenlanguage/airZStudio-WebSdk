@echo off
REM Double-click me: serves the interactive plain-HTML example on http://localhost:3001
REM (?debug=1 shows the inspector + sign-in gate; points baseUrl at the controller on :3467)
cd /d "%~dp0"
if not exist "sdk\dist\airz-sdk.global.min.js" call npm run build:sdk
echo.
echo   interactive  -^>  http://localhost:3001/examples/interactive/interactive.html?debug=1
echo.
start "" "http://localhost:3001/examples/interactive/interactive.html?baseUrl=http://localhost:3467&debug=1"
call npx --yes serve . -l 3001
