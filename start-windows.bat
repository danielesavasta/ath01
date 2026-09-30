@echo off
rem Starts the installation on the Windows PC: the Kinect bridge (it also serves the page, no other web server
rem needed) and Chrome full screen. Builds the bridge the first time. Close the bridge window to stop it.
cd /d "%~dp0"
if not exist tools\kinect-win\KinectBridge.exe call tools\kinect-win\build.bat
if not exist tools\kinect-win\KinectBridge.exe exit /b 1

rem a bridge left over from before keeps the Kinect busy
taskkill /im KinectBridge.exe /f >nul 2>&1
start "Athena Kinect" /min tools\kinect-win\KinectBridge.exe
timeout /t 3 /nobreak >nul

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if "%1"=="window" ( start "" "%CHROME%" http://127.0.0.1:8770/index.htm ) else ( start "" "%CHROME%" --kiosk --autoplay-policy=no-user-gesture-required http://127.0.0.1:8770/index.htm )
