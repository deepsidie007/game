@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer from https://nodejs.org/
  pause
  exit /b 1
)
echo [1/3] Installing deployment tools...
call npm install --no-audit --no-fund
if errorlevel 1 goto failed
echo [2/3] Authorize your Cloudflare account in the browser...
call npx --yes --package=wrangler@latest wrangler login --device
if errorlevel 1 goto failed
echo [3/3] Deploying the game...
call npx --yes --package=wrangler@latest wrangler deploy
if errorlevel 1 goto failed
echo.
echo Done. Copy the workers.dev URL printed above and share it with friends.
pause
exit /b 0
:failed
echo.
echo Deployment stopped. Read the error above and see README.md.
pause
exit /b 1
