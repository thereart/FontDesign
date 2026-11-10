@echo off
rem Double-click to open Font Design v2 in your browser. Close this window to stop it.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org and try again. & pause & exit /b)
rem Needs Node 18 or newer. With nvm, switch with: nvm use 19.8.1 (or any installed version from 18 up).
for /f "tokens=1 delims=v." %%v in ('node -v') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 18 (
  echo Font Design v2 needs Node.js 18 or newer, but this computer is using Node %NODE_MAJOR%.
  echo If you use nvm, run "nvm use 19.8.1" (or another installed version from 18 up^), then try again.
  pause
  exit /b
)
rem First run only: the small add-on that opens pages in Edge or Chrome to see which fonts really render.
if not exist "node_modules\playwright-core" (
  echo Setting up for the first time...
  call npm install --no-fund --no-audit >nul 2>nul || echo Couldn't install the add-on, so fonts will be read from the CSS only.
)
start "" /b cmd /c "timeout /t 1 >nul & start http://localhost:4342"
node server.mjs
pause
