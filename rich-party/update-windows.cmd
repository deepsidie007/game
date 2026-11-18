@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22 or newer: https://nodejs.org/
  pause
  exit /b 1
)
echo Updating the existing rich-party-city game...
echo Using your existing Cloudflare login. No new login is requested here.
call npx --yes --package=wrangler@latest wrangler deploy
if errorlevel 1 (
  echo.
  echo Update stopped. Copy or capture the error printed above.
  echo If not logged in, run: npx --yes --package=wrangler@latest wrangler login --device
  pause
  exit /b 1
)
echo.
echo Update complete. Open your existing game URL and refresh the page.
pause
