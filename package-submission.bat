@echo off
:: ============================================================
:: package-submission.bat — CXone Device Signal Bridge
:: Zips the entire submission folder for upload to Sparkathon site.
:: Output: ..\cxone-device-signal-bridge-submission.zip (one level up)
::
:: NODE_MODULES TRADE-OFF:
::   node_modules are EXCLUDED from the zip.
::   The start-demo.bat script runs `npm install` automatically on first run,
::   which requires internet access (npmjs.org).
::   If judges may be fully offline during review, set INCLUDE_DEPS=1 below
::   to bundle node_modules (adds ~30-50 MB but allows fully offline cold start).
:: ============================================================

set "INCLUDE_DEPS=0"

set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
set "OUTZIP=%ROOT%\..\cxone-device-signal-bridge-submission.zip"

echo.
echo  [package] Building submission zip...
echo  [package] Source:  %ROOT%
echo  [package] Output:  %OUTZIP%
echo.

:: Delete previous zip if it exists
if exist "%OUTZIP%" del /f "%OUTZIP%"

:: Use PowerShell Compress-Archive (available on Windows 10+)
:: Build exclusion list
if "%INCLUDE_DEPS%"=="0" (
    echo  [package] Excluding node_modules (INCLUDE_DEPS=0). Start script installs on first run.
    powershell -NoProfile -Command ^
        "$src = '%ROOT%'; $out = '%OUTZIP%';" ^
        "$items = Get-ChildItem -Path $src -Recurse -Force" ^
        "  | Where-Object { $_.FullName -notmatch '\\\\node_modules\\\\' -and $_.FullName -notmatch '\\\\\.git\\\\' -and $_.FullName -notmatch '\\\\\.logs\\\\' -and $_.Name -ne '.pids' };" ^
        "$tmpDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), 'dsb-pkg-' + [System.Guid]::NewGuid().ToString('N'));" ^
        "New-Item -ItemType Directory $tmpDir | Out-Null;" ^
        "foreach ($item in $items) {" ^
        "  $rel = $item.FullName.Substring($src.Length).TrimStart('\');" ^
        "  $dst = [System.IO.Path]::Combine($tmpDir, 'cxone-device-signal-bridge-submission', $rel);" ^
        "  if ($item.PSIsContainer) { New-Item -ItemType Directory -Force $dst | Out-Null }" ^
        "  else { $dstDir = Split-Path $dst; New-Item -ItemType Directory -Force $dstDir | Out-Null; Copy-Item $item.FullName $dst }" ^
        "};" ^
        "Compress-Archive -Path \"$tmpDir\cxone-device-signal-bridge-submission\" -DestinationPath $out -Force;" ^
        "Remove-Item -Recurse -Force $tmpDir;" ^
        "Write-Host 'Done.'"
) else (
    echo  [package] INCLUDING node_modules (INCLUDE_DEPS=1). Offline cold start supported.
    powershell -NoProfile -Command ^
        "$src = '%ROOT%'; $out = '%OUTZIP%';" ^
        "$items = Get-ChildItem -Path $src -Recurse -Force" ^
        "  | Where-Object { $_.FullName -notmatch '\\\\\.git\\\\' -and $_.FullName -notmatch '\\\\\.logs\\\\' -and $_.Name -ne '.pids' };" ^
        "$tmpDir = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), 'dsb-pkg-' + [System.Guid]::NewGuid().ToString('N'));" ^
        "New-Item -ItemType Directory $tmpDir | Out-Null;" ^
        "foreach ($item in $items) {" ^
        "  $rel = $item.FullName.Substring($src.Length).TrimStart('\');" ^
        "  $dst = [System.IO.Path]::Combine($tmpDir, 'cxone-device-signal-bridge-submission', $rel);" ^
        "  if ($item.PSIsContainer) { New-Item -ItemType Directory -Force $dst | Out-Null }" ^
        "  else { $dstDir = Split-Path $dst; New-Item -ItemType Directory -Force $dstDir | Out-Null; Copy-Item $item.FullName $dst }" ^
        "};" ^
        "Compress-Archive -Path \"$tmpDir\cxone-device-signal-bridge-submission\" -DestinationPath $out -Force;" ^
        "Remove-Item -Recurse -Force $tmpDir;" ^
        "Write-Host 'Done.'"
)

:: Print size
for %%f in ("%OUTZIP%") do (
    set /a SIZE_KB=%%~zf/1024
    echo.
    echo  [package] =====================================================
    echo  [package] Zip created:  %OUTZIP%
    echo  [package] Size:         !SIZE_KB! KB  (~%%~zf bytes)
    echo  [package] =====================================================
    echo.
    echo  NEXT STEP: Upload this zip (or a shared-drive link to it) to
    echo  the Sparkathon site's "Prototype Instructions and Explanations"
    echo  section of your team's idea page.
    echo.
)
