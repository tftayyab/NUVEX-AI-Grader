@echo off
REM Starts API + React UI in two new Command Prompt windows.
cd /d "%~dp0"

if not exist "server\.env" (
  echo Missing server\.env — run SETUP.cmd first and add MONGODB_URI.
  pause
  exit /b 1
)

start "NUVEX API" cmd /k "cd /d %~dp0server && npm run dev"
timeout /t 2 /nobreak >nul
start "NUVEX UI" cmd /k "cd /d %~dp0client && npm run dev"

echo.
echo Opened two windows.
echo Student:  http://localhost:5173
echo Admin:    http://localhost:5173/admin
echo.
pause
