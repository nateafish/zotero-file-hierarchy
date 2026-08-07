@echo off
REM ============================================================
REM  One-click install of File Hierarchy Portable into Zotero
REM  Downloads the latest File Hierarchy.js from GitHub and
REM  installs it into Zotero's translators/ folder.
REM  Usage: double-click, or run from a command prompt
REM  Custom data dir (first): set ZOTERO_DATA=your-path
REM ============================================================
setlocal

set "URL=https://raw.githubusercontent.com/nateafish/zotero-file-hierarchy/master/File%%20Hierarchy.js"
if "%ZOTERO_DATA%"=="" set "ZOTERO_DATA=%USERPROFILE%\Zotero"
set "TRANSLATORS_DIR=%ZOTERO_DATA%\translators"
set "TARGET=%TRANSLATORS_DIR%\File Hierarchy.js"

if not exist "%ZOTERO_DATA%" (
  echo [ERROR] Zotero data directory not found: %ZOTERO_DATA%
  echo         Open Zotero - Settings - Advanced - Files and Folders - "Show Data Directory"
  echo         to find the real path, then run:  set ZOTERO_DATA=your-path  and run again.
  pause
  exit /b 1
)

if not exist "%TRANSLATORS_DIR%" mkdir "%TRANSLATORS_DIR%"

echo Downloading File Hierarchy.js from GitHub ...
curl -fsSL "%URL%" -o "%TARGET%"
if errorlevel 1 (
  echo [ERROR] Download failed. Check your network connection and try again.
  pause
  exit /b 1
)

echo [OK] Installed: %TARGET%
echo.
echo Next:
echo  1. Restart Zotero
echo  2. Select a Collection - File - Export
echo  3. Choose "File Hierarchy Portable", tick "Export Files", then export
pause
endlocal
