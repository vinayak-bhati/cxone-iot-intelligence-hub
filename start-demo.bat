@echo off
setlocal EnableDelayedExpansion
:: ============================================================
:: start-demo.bat — CXone Device Signal Bridge
:: Single-window startup for Windows. All services run in the
:: background; output is redirected to logs\<service>.log
:: Requirements: Node.js 18+  (script will try to auto-install)
:: ============================================================

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"

color 0B
echo.
echo  =====================================================
echo   CXone Device Signal Bridge — Sparkathon 2026
echo   Starting all services...
echo  =====================================================
echo.

:: ── 1. Check / auto-install Node.js ──────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 goto :installNode

:: Validate version >= 18
for /f "tokens=*" %%v in ('node --version 2^>nul') do set "NODEVERSION=%%v"
set "_ver=%NODEVERSION:~1%"
for /f "delims=." %%m in ("%_ver%") do set "NODEMAJOR=%%m"
if defined NODEMAJOR (
    if !NODEMAJOR! LSS 18 (
        echo  [WARN] Node.js %NODEVERSION% found, but v18+ is required. Attempting upgrade...
        goto :installNode
    )
)
echo  [check] Node.js %NODEVERSION% found. Good.
goto :checkCurl

:installNode
echo  [setup] Node.js not found ^(or version too old^). Attempting auto-install...
echo.
where winget >nul 2>&1
if not errorlevel 1 (
    echo  [setup] Using winget to install Node.js LTS...
    winget install OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
    if not errorlevel 1 goto :rerunPrompt
)
where choco >nul 2>&1
if not errorlevel 1 (
    echo  [setup] Using Chocolatey to install Node.js LTS...
    choco install nodejs-lts -y
    if not errorlevel 1 goto :rerunPrompt
)
echo.
echo  [ERROR] Could not auto-install Node.js.
echo          Please install Node.js 18+ manually from:
echo              https://nodejs.org/en/download
echo          Then re-run this script.
pause
exit /b 1

:rerunPrompt
echo.
echo  -------------------------------------------------------
echo   ACTION REQUIRED: Close this window and re-run
echo   start-demo.bat to pick up the new Node.js PATH.
echo  -------------------------------------------------------
pause
exit /b 0

:: ── 2. Check curl (needed for health checks) ─────────────────────────────────
:checkCurl
set "CURL_AVAILABLE=1"
where curl >nul 2>&1
if errorlevel 1 (
    set "CURL_AVAILABLE=0"
    echo  [WARN] curl not found — health checks will be skipped.
)

:: ── 3. Install dependencies (only if node_modules absent) ───────────────────
echo.
echo  [install] Checking service dependencies...

if not exist "%ROOT%\services\event-normalizer\node_modules" (
    echo  [install] event-normalizer: running npm install...
    pushd "%ROOT%\services\event-normalizer"
    call npm install --registry https://registry.npmjs.org --silent
    popd
    echo  [install] event-normalizer done.
) else (
    echo  [install] event-normalizer: node_modules present, skipping.
)

if not exist "%ROOT%\services\aep-stub\node_modules" (
    echo  [install] aep-stub: running npm install...
    pushd "%ROOT%\services\aep-stub"
    call npm install --registry https://registry.npmjs.org --silent
    popd
    echo  [install] aep-stub done.
) else (
    echo  [install] aep-stub: node_modules present, skipping.
)

if not exist "%ROOT%\services\cognigy-triage\node_modules" (
    echo  [install] cognigy-triage: running npm install...
    pushd "%ROOT%\services\cognigy-triage"
    call npm install --registry https://registry.npmjs.org --silent
    popd
    echo  [install] cognigy-triage done.
) else (
    echo  [install] cognigy-triage: node_modules present, skipping.
)

:: ── 3. Kill any stale processes on ports 3001-3003 and 5173 ──────────────────
echo.
echo  [clean] Clearing ports 3001 / 3002 / 3003 / 5173...
for %%p in (3001 3002 3003 5173) do (
    for /f "tokens=5" %%i in ('netstat -ano 2^>nul ^| findstr ":%%p "') do (
        taskkill /F /PID %%i >nul 2>&1
    )
)
timeout /t 1 /nobreak >nul

:: ── 4. Prepare logs directory ─────────────────────────────────────────────────
if not exist "%ROOT%\logs" mkdir "%ROOT%\logs"
type nul > "%ROOT%\logs\cognigy-triage.log"
type nul > "%ROOT%\logs\aep-stub.log"
type nul > "%ROOT%\logs\event-normalizer.log"
type nul > "%ROOT%\logs\web-ui.log"

:: ── 5. Start services in background — single window, no popups ───────────────
echo.
echo  [start] Launching services in background (output redirected to logs\)...

set "L_TRIAGE=%ROOT%\logs\cognigy-triage.log"
set "L_AEP=%ROOT%\logs\aep-stub.log"
set "L_NORM=%ROOT%\logs\event-normalizer.log"
set "L_UI=%ROOT%\logs\web-ui.log"

start /B "" cmd /c "cd /d "%ROOT%\services\cognigy-triage" && node src/index.js 1>>"%L_TRIAGE%" 2>&1"
timeout /t 1 /nobreak >nul

start /B "" cmd /c "cd /d "%ROOT%\services\aep-stub" && node src/index.js 1>>"%L_AEP%" 2>&1"
timeout /t 1 /nobreak >nul

start /B "" cmd /c "cd /d "%ROOT%\services\event-normalizer" && node src/index.js 1>>"%L_NORM%" 2>&1"
timeout /t 1 /nobreak >nul

echo  [start] cognigy-triage    :3003  (log: logs\cognigy-triage.log)
echo  [start] aep-stub          :3002  (log: logs\aep-stub.log)
echo  [start] event-normalizer  :3001  (log: logs\event-normalizer.log)

:: ── 6. Health-check loop ─────────────────────────────────────────────────────
echo.
if "%CURL_AVAILABLE%"=="0" (
    echo  [skip] Health checks skipped ^(curl not available^). Waiting 5 s for services...
    timeout /t 5 /nobreak >nul
) else (
    echo  [wait] Waiting for services to be healthy ^(up to 30 s each^)...
    call :waitForPort 3003 cognigy-triage 30
    call :waitForPort 3002 aep-stub 30
    call :waitForPort 3001 event-normalizer 30
)

:: ── 7. Start web UI static server ────────────────────────────────────────────
echo.
echo  [ui] Starting web UI on port 5173 via npx serve...
start /B "" cmd /c "cd /d "%ROOT%" && npx serve web-ui -p 5173 --no-clipboard 1>>"%L_UI%" 2>&1"
timeout /t 3 /nobreak >nul

:: ── 8. Wait for web UI port ───────────────────────────────────────────────────
if "%CURL_AVAILABLE%"=="1" (
    call :waitForPort 5173 web-ui 20
)

:: ── 9. Open browser ──────────────────────────────────────────────────────────
echo.
echo  [browser] Opening http://localhost:5173/demo.html ...
start http://localhost:5173/demo.html

:: ── 10. Dashboard + keep-alive ───────────────────────────────────────────────
echo.
echo  =====================================================
echo   All services are UP!
echo  =====================================================
echo   Event Normalizer  :  http://localhost:3001/health
echo   AEP Stub          :  http://localhost:3002/health
echo   Cognigy Triage    :  http://localhost:3003/health
echo   Demo UI           :  http://localhost:5173/demo.html
echo  ─────────────────────────────────────────────────────
echo   Logs ^(open in any editor or run: type logs\^<name^>.log^):
echo     logs\cognigy-triage.log
echo     logs\aep-stub.log
echo     logs\event-normalizer.log
echo     logs\web-ui.log
echo  ─────────────────────────────────────────────────────
echo   To STOP from another window:  stop-demo.bat
echo   OR press any key below to stop and exit now.
echo  ─────────────────────────────────────────────────────
echo.
echo  Press any key to STOP all services and exit...
pause >nul

:: ── 11. Shutdown on keypress ──────────────────────────────────────────────────
echo.
echo  [stop] Stopping all services...
for %%p in (3001 3002 3003 5173) do (
    for /f "tokens=5" %%i in ('netstat -ano 2^>nul ^| findstr ":%%p "') do (
        taskkill /F /PID %%i >nul 2>&1
    )
)
timeout /t 1 /nobreak >nul
echo  [stop] All services stopped.
echo  [info] Logs preserved in: %ROOT%\logs\
echo.
goto :eof

:: ── Subroutine: wait for a port to respond ────────────────────────────────────
:waitForPort
set "PORT=%~1"
set "LABEL=%~2"
set "MAXWAIT=%~3"
set /a ELAPSED=0
:loopPort
curl -sf http://localhost:%PORT%/health >nul 2>&1
if not errorlevel 1 (
    echo  [ready] %LABEL%  :%PORT% is UP  (%ELAPSED%s)
    goto :eof
)
if !ELAPSED! geq %MAXWAIT% (
    echo  [WARN]  %LABEL%  :%PORT% did not respond after %MAXWAIT%s.
    echo          Check the log: logs\%LABEL%.log
    goto :eof
)
set /a ELAPSED+=1
timeout /t 1 /nobreak >nul
goto loopPort
