@echo off
rem Starts the installation on the Windows PC. Pass "one" to use Kinect One; the default is Kinect 360.
cd /d "%~dp0"
set "BRIDGE=%~dp0tools\kinect-win\KinectBridge.exe"
set "BRIDGE_TITLE=Athena Kinect 360"
set "BUILD_MODE="
set "WINDOW_MODE=%~1"
if /I "%~1"=="one" (
    set "BRIDGE=%~dp0tools\kinect-win\KinectBridgeV2\KinectBridge.exe"
    set "BRIDGE_TITLE=Athena Kinect One"
    set "BUILD_MODE=one"
    set "WINDOW_MODE=%~2"
)
if /I "%~1"=="v2" (
    set "BRIDGE=%~dp0tools\kinect-win\KinectBridgeV2\KinectBridge.exe"
    set "BRIDGE_TITLE=Athena Kinect One"
    set "BUILD_MODE=one"
    set "WINDOW_MODE=%~2"
)
if not exist "%BRIDGE%" call tools\kinect-win\build.bat %BUILD_MODE%
if not exist "%BRIDGE%" exit /b 1

rem a bridge left over from before keeps the Kinect busy
taskkill /im KinectBridge.exe /f >nul 2>&1
start /D "%~dp0" "%BRIDGE_TITLE%" /min "%BRIDGE%" --root "%~dp0."
timeout /t 3 /nobreak >nul

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if /I "%WINDOW_MODE%"=="window" ( start "" "%CHROME%" http://127.0.0.1:8770/index.htm ) else ( start "" "%CHROME%" --window-position=1920,0 --kiosk --autoplay-policy=no-user-gesture-required http://127.0.0.1:8770/index.htm )
