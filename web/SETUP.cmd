@echo off
REM ============================================================
REM  NUVEX AI Grader — one-time setup on a NEW Windows PC
REM  Run this from:  web\SETUP.cmd
REM  (Double-click or run inside Command Prompt)
REM ============================================================

cd /d "%~dp0"

echo.
echo [1/5] Checking Node.js...
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo ERROR: Node.js is not installed.
  echo Download LTS from https://nodejs.org and re-run this script.
  pause
  exit /b 1
)
node -v
npm -v

echo.
echo [2/5] Installing server packages...
cd server
call npm install
if errorlevel 1 (
  echo Server npm install failed.
  pause
  exit /b 1
)

if not exist ".env" (
  echo.
  echo Creating server\.env from .env.example ...
  copy .env.example .env >nul
  echo.
  echo IMPORTANT: Open web\server\.env and paste your MongoDB Atlas URI
  echo into MONGODB_URI=...
  echo Leave ENABLE_CAD=false until you want CAD uploads.
)

echo.
echo [3/5] Installing client packages...
cd ..\client
call npm install
if errorlevel 1 (
  echo Client npm install failed.
  pause
  exit /b 1
)

if not exist ".env" (
  copy .env.example .env >nul
)

echo.
echo [4/5] Optional Python grader deps (skip if you only need the web UI)...
cd ..\..
if exist requirements.txt (
  echo You can later run:  pip install -r requirements.txt
  echo For free local models: pip install -r requirements-local.txt
  echo Do NOT pull Ollama models until you are ready on that PC.
)

echo.
echo [5/5] Done.
echo.
echo NEXT STEPS:
echo   1. Edit web\server\.env  -^> set MONGODB_URI
echo   2. Start API:     cd web\server ^&^& npm run dev
echo   3. Start UI:      cd web\client ^&^& npm run dev
echo   4. Open:          http://localhost:5173        (student)
echo                     http://localhost:5173/admin  (admin / Tests)
echo.
echo CAD is OFF by default. Set ENABLE_CAD=true in web\server\.env to enable.
echo.
pause
