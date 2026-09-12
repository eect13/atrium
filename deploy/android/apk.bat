@echo off
setlocal EnableExtensions
cd /d "%~dp0."
cd /d "..\.."
if not exist "package.json" goto :noroots
if not exist "scripts\pack-android.mjs" goto :noroots

where node >nul 2>nul
if errorlevel 1 goto :nonode

REM Force Microsoft JDK 17 when present (not Studio JBR / JDK 25)
if exist "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot" (
  set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"
) else (
  for /d %%J in ("C:\Program Files\Microsoft\jdk-17*") do (
    if not defined JAVA_HOME set "JAVA_HOME=%%~J"
  )
)
if defined JAVA_HOME set "PATH=%JAVA_HOME%\bin;%PATH%"

if exist "%LOCALAPPDATA%\Android\Sdk" (
  set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
  set "ANDROID_SDK_ROOT=%LOCALAPPDATA%\Android\Sdk"
)
if exist "%ANDROID_HOME%\ndk\30.0.16138531" set "NDK_HOME=%ANDROID_HOME%\ndk\30.0.16138531"

echo Atrium - Android APK (Tauri)
echo JAVA_HOME=%JAVA_HOME%
if defined JAVA_HOME java -version
echo.
node scripts\pack-android.mjs
if errorlevel 1 goto :fail
echo.
echo === SUCCESS ===
echo APK folder: %CD%\deploy\android\
for %%F in ("deploy\android\atrium-v*-arm64-release.apk") do if exist "%%~F" echo   %%~fF
start "" explorer "%CD%\deploy\android"
pause
exit /b 0

:noroots
echo ERROR: Could not find the Atrium repo root.
pause
exit /b 1
:nonode
echo Node.js 22+ is required.
pause
exit /b 1
:fail
echo Build failed. Need JDK 17, Android SDK/NDK, Rust.
pause
exit /b 1
