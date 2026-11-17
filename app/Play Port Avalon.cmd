@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Port Avalon
cd /d "%~dp0.."
set "ROOT=%CD%"
set "PA_WORLDS=%ROOT%\app\worlds"
set "SIM_POP="
set "NODE="
set "MAJOR="
set "MINOR="

call :consider "%ROOT%\node\node.exe"
if not defined NODE call :consider "%~dp0node\node.exe"
if not defined NODE call :consider "%ProgramFiles%\nodejs\node.exe"
if not defined NODE call :consider "%ProgramFiles(x86)%\nodejs\node.exe"
if not defined NODE call :consider "%LocalAppData%\Programs\node\node.exe"
if not defined NODE (
  for /f "delims=" %%I in ('where node 2^>nul') do (
    if not defined NODE call :consider "%%I"
  )
)

if not defined NODE (
  echo Install Node.js 22.6 or newer from https://nodejs.org/ and run this again.
  pause
  exit /b 1
)

set "FLAGS="
if !MAJOR! LSS 22 set "FLAGS=--experimental-strip-types"
if !MAJOR! EQU 22 if !MINOR! LSS 18 set "FLAGS=--experimental-strip-types"

set "UP=%TEMP%\pa-port-avalon-up"
del "%UP%" 2>nul
"%NODE%" !FLAGS! "%ROOT%\app\launch.ts"
set "RC=!ERRORLEVEL!"
if exist "%UP%" (
  del "%UP%" 2>nul
  exit /b 0
)
echo The game stopped before the title screen.
pause
exit /b !RC!

:consider
if defined NODE exit /b 0
if "%~1"=="" exit /b 0
echo %~1 | findstr /I "WindowsApps" >nul && exit /b 0
if not exist "%~1" exit /b 0
set "VER="
set "VERFILE=%TEMP%\pa-node-ver.txt"
del "%VERFILE%" 2>nul
"%~1" -p "process.versions.node" > "%VERFILE%" 2>nul
if not exist "%VERFILE%" exit /b 0
set /p VER=<"%VERFILE%"
del "%VERFILE%" 2>nul
if not defined VER exit /b 0
for /f "tokens=1,2 delims=." %%A in ("!VER!") do (
  set "MAJ=%%A"
  set "MIN=%%B"
)
if !MAJ! GTR 22 goto :take
if !MAJ! EQU 22 if !MIN! GEQ 6 goto :take
exit /b 0
:take
set "NODE=%~1"
set "MAJOR=!MAJ!"
set "MINOR=!MIN!"
exit /b 0
