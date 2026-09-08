@echo off
REM ============================================================
REM RedVault one-click start
REM Usage: run  start.cmd  (or double-click) in project root
REM Only entry: http://127.0.0.1:3789  (8923 is deprecated)
REM ============================================================
setlocal EnableDelayedExpansion

cd /d "%~dp0"
set "PORT=3789"
set "URL=http://127.0.0.1:%PORT%"

REM ---- locate node ----
set "NODE="
where node >nul 2>&1 && set "NODE=node"
if not defined NODE (
  if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-2\node.exe" (
    set "NODE=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2-2\node.exe"
  )
)
if not defined NODE (
  echo [error] node not found. Please install Node.js 18+.
  exit /b 1
)

REM ---- clean old listeners on 3789 and deprecated 8923 ----
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3789 .*LISTENING"') do (
  echo [clean] killing old process on 3789 (PID %%p)
  taskkill /F /PID %%p >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":8923 .*LISTENING"') do (
  echo [clean] killing deprecated process on 8923 (PID %%p)
  taskkill /F /PID %%p >nul 2>&1
)
REM wait for ports to be fully released before starting
timeout /t 2 /nobreak >nul

REM ---- start service in a detached minimized window ----
REM (no /b: service gets its own console so it survives this window closing)
echo [..] starting RedVault (%NODE% server/index.js) ...
start "RedVault-server" /min "%NODE%" server\index.js

REM ---- wait and probe health ----
set "ok=0"
for /l %%i in (1,1,15) do (
  timeout /t 1 /nobreak >nul
  powershell -NoProfile -Command "try { $r = Invoke-WebRequest -Uri '%URL%/api/health' -UseBasicParsing -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
  if !errorlevel! equ 0 ( set "ok=1" & goto :ready )
)

:ready
if "!ok!"=="1" (
  echo.
  start "" "%URL%"
  echo [OK] RedVault started. Opening %URL% in your browser...
  echo      Entry: %URL%
  echo      Service runs in the minimized window titled "RedVault-server".
  echo      Close that window to stop the service. This window can be closed.
) else (
  echo [error] service failed to start. Check server/index.js or port conflicts.
)
endlocal
pause
