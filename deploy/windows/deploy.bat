@echo off
setlocal EnableExtensions
cd /d "%~dp0."
cd /d "..\.."
if not exist "package.json" goto :noroots
where node >nul 2>nul
if errorlevel 1 goto :nonode
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
echo Atrium - Windows NSIS (Tauri)
node scripts\deploy.mjs
if errorlevel 1 goto :fail
echo.
echo Copying to Installers folder if present...
if exist "%USERPROFILE%\Desktop\Vibe Apps\Atrium\Installers\Windows" (
  for %%F in ("deploy\windows\*-setup.exe") do (
    if exist "%%~F" copy /Y "%%~F" "%USERPROFILE%\Desktop\Vibe Apps\Atrium\Installers\Windows\" >nul
  )
)
start "" explorer "%CD%\deploy\windows"
pause
exit /b 0
:noroots
echo ERROR: repo root not found
pause
exit /b 1
:nonode
echo Node.js required
pause
exit /b 1
:fail
echo Build failed
pause
exit /b 1
