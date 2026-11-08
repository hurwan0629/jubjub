@echo off
rem 줍줍 라벨러 exe 다시 만들기 (소스를 고쳤을 때만 필요)
rem 임시 폴더에 빌드용 가상환경을 만들고, 결과는 ..\jupjup-labeler.exe 로 나옵니다.
setlocal
chcp 65001 >nul
cd /d "%~dp0"
set "VENV=%LOCALAPPDATA%\JupJupLabeler\build-env"

where py >nul 2>nul
if %errorlevel%==0 (set "PY=py -3") else (set "PY=python")

if not exist "%VENV%\Scripts\python.exe" (
    echo [1/3] 빌드용 가상환경을 만드는 중...
    %PY% -m venv "%VENV%" || goto :fail
)
echo [2/3] 패키지 설치 중...
"%VENV%\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt || goto :fail
echo [3/3] exe 만드는 중... (1~2분)
"%VENV%\Scripts\python.exe" build.py || goto :fail
echo.
echo 끝! ..\jupjup-labeler.exe 를 실행해 보세요.
pause
exit /b 0

:fail
echo.
echo 빌드에 실패했어요. 위의 오류 메시지를 확인해 주세요.
pause
exit /b 1
