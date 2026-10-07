@echo off
rem Builds KinectBridge.exe with the C# compiler that comes with Windows (no Visual Studio needed).
rem Needs the Kinect for Windows SDK 1.8, and for open/closed hands the Kinect for Windows Developer Toolkit 1.8.
setlocal
cd /d "%~dp0"
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" ( echo .NET Framework 4 compiler not found. & goto fail )

if /I "%~1"=="one" goto buildone
if /I "%~1"=="v2" goto buildone

set "SDK=%KINECTSDK10_DIR%"
if "%SDK%"=="" set "SDK=%ProgramFiles%\Microsoft SDKs\Kinect\v1.8\"
set "KINECT=%SDK%Assemblies\Microsoft.Kinect.dll"
if not exist "%KINECT%" ( echo Kinect for Windows SDK 1.8 not found. Install it first, see README.md. & goto fail )

set "TK=%KINECT_TOOLKIT_DIR%"
if "%TK%"=="" set "TK=%ProgramFiles%\Microsoft SDKs\Kinect\Developer Toolkit v1.8.0\"
set "INTER=%TK%Assemblies\Microsoft.Kinect.Toolkit.Interaction.dll"

if exist "%INTER%" goto grip
echo Developer Toolkit 1.8 not found: building WITHOUT open/closed hands.
"%CSC%" /nologo /platform:x64 /optimize /define:NOGRIP /out:KinectBridge.exe /r:"%KINECT%" /r:System.Drawing.dll KinectBridge.cs || goto fail
copy /y "%KINECT%" . >nul
goto done

:grip
"%CSC%" /nologo /platform:x64 /optimize /out:KinectBridge.exe /r:"%KINECT%" /r:"%INTER%" /r:System.Drawing.dll KinectBridge.cs || goto fail
copy /y "%KINECT%" . >nul
copy /y "%INTER%" . >nul
copy /y "%TK%Redist\amd64\KinectInteraction180_64.dll" . >nul || echo KinectInteraction180_64.dll not found in the Toolkit's Redist\amd64 folder: copy it next to KinectBridge.exe.

goto done

:buildone
set "SDK=%KINECTSDK20_DIR%"
if "%SDK%"=="" set "SDK=%ProgramFiles%\Microsoft SDKs\Kinect\v2.0_1409\"
set "KINECT=%SDK%Assemblies\Microsoft.Kinect.dll"
if not exist "%KINECT%" ( echo Kinect for Windows SDK 2.0 not found. Install it first, see README.md. & goto fail )
if not exist KinectBridgeV2 mkdir KinectBridgeV2
"%CSC%" /nologo /platform:x64 /optimize /define:KINECTV2 /out:KinectBridgeV2\KinectBridge.exe /r:"%KINECT%" /r:System.Drawing.dll KinectBridge.cs || goto fail
copy /y "%KINECT%" KinectBridgeV2\ >nul || goto fail
echo Built tools\kinect-win\KinectBridgeV2\KinectBridge.exe
exit /b 0

:done
echo Built tools\kinect-win\KinectBridge.exe
exit /b 0

:fail
echo Build failed.
pause
exit /b 1
