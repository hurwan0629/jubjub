@echo off
rem BBox Labeler launcher for Windows - double-click this file.
setlocal
cd /d "%~dp0"
set "APP=%~dp0bbox_labeler.py"

rem 1) Python launcher (installed with python.org Python) - no console window
where pyw >nul 2>nul
if %errorlevel%==0 (
    start "" pyw -3 "%APP%"
    exit /b 0
)

rem 2) pythonw on PATH - no console window
where pythonw >nul 2>nul
if %errorlevel%==0 (
    start "" pythonw "%APP%"
    exit /b 0
)

rem 3) python on PATH - console stays open so errors are visible
where python >nul 2>nul
if %errorlevel%==0 (
    python "%APP%"
    if errorlevel 1 pause
    exit /b 0
)

echo.
echo  [BBox Labeler] Python 3 was not found on this PC.
echo.
echo  1. Install Python 3.8 or newer from https://www.python.org/downloads/
echo  2. During setup, CHECK "Add python.exe to PATH".
echo  3. Double-click run-windows.bat again.
echo.
start "" https://www.python.org/downloads/
pause
