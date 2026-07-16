@echo off
:: ============================================================
:: stop-demo.bat — CXone Device Signal Bridge
:: Kills all demo service processes on ports 3001/3002/3003/5173.
:: ============================================================

echo.
echo  [stop] Stopping all CXone Device Signal Bridge demo services...
echo.

set KILLED=0

for %%p in (3001 3002 3003 5173) do (
    for /f "tokens=5" %%i in ('netstat -ano 2^>nul ^| findstr ":%%p "') do (
        taskkill /F /PID %%i >nul 2>&1
        if not errorlevel 1 (
            echo  [stop] Killed process on port %%p  (PID %%i)
            set /a KILLED+=1
        )
    )
)

if %KILLED%==0 (
    echo  [stop] No processes found on ports 3001/3002/3003/5173.
) else (
    echo.
    echo  [stop] Stopped %KILLED% process(es).
)

:: Brief pause to let ports release
timeout /t 1 /nobreak >nul

:: Verify
set STILL=0
for %%p in (3001 3002 3003 5173) do (
    netstat -ano 2>nul | findstr ":%%p " >nul 2>&1
    if not errorlevel 1 set /a STILL+=1
)

echo.
if %STILL%==0 (
    echo  All demo services stopped. Ports 3001/3002/3003/5173 are free.
) else (
    echo  WARNING: Some ports may still be in use. Check Task Manager.
)
echo.
echo  Logs are preserved in the logs\ folder.
echo  Delete logs\ manually if you want a clean slate.
echo.
