@echo off
setlocal
cd /d "%~dp0"
echo Installing Electron build dependencies...
call npm install
if errorlevel 1 goto :fail
echo Running automated source tests...
call npm test
if errorlevel 1 goto :fail
echo Building no-admin portable Windows EXE...
call npm run dist:portable
if errorlevel 1 goto :fail
echo.
echo Build complete. Open the dist folder.
explorer "%~dp0dist"
pause
exit /b 0
:fail
echo.
echo BUILD FAILED. Review messages above.
pause
exit /b 1
