@echo off
REM Double-click me: serves the Premier League scoreboard plain-HTML example on http://localhost:3000
cd /d "%~dp0"
if not exist "sdk\dist\airz-sdk.global.min.js" call npm run build:sdk
echo.
echo   premiere_league_scoreboard  -^>  http://localhost:3000/examples/premiere_league_scoreboard/
echo.
start "" http://localhost:3000/examples/premiere_league_scoreboard/
call npx --yes serve . -l 3000
