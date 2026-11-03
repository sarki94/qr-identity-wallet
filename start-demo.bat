@echo off
REM Double-click to start everything and open the Guided Demo.
REM Needs the one-time setup from the README (.venv created, packages installed, npm install done).
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo The .venv folder is missing. Do the one-time setup in the README first.
  pause
  exit /b 1
)
if not exist "web\dist\index.html" (
  echo Building the web app for the first time...
  pushd web
  call npm run build
  popd
)
start "QRW services (keep open)" cmd /k ".venv\Scripts\python.exe services\scripts\run_local.py"
timeout /t 6 /nobreak >nul
start "QRW web app (keep open)" cmd /k "cd web && npm run preview"
timeout /t 4 /nobreak >nul
start "" "http://localhost:4173/demo"
echo.
echo Two windows opened: services and web app. Keep them open while you demo.
echo To stop: close both windows.
