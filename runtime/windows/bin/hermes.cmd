@echo off
setlocal
pushd "%~dp0..\..\.." >nul || exit /b 1
set "ROOT=%CD%"
popd
set "HERMES_HOME=%ROOT%\.hermes"
set "HERMES_EXE=%ROOT%\.hermes\hermes-agent\venv\Scripts\hermes.exe"
if not exist "%HERMES_EXE%" (
  echo [Hermes] 未找到便携 Hermes 虚拟环境: "%HERMES_EXE%" 1>&2
  exit /b 1
)
pushd "%ROOT%\.hermes\hermes-agent" >nul
"%HERMES_EXE%" %*
set "EXIT_CODE=%ERRORLEVEL%"
popd
endlocal & exit /b %EXIT_CODE%
