@echo off
REM ========================================
REM Development Watch Mode
REM ========================================

echo.
echo ========================================
echo Starting Development Watch Mode
echo ========================================
echo.
echo TypeScript will be automatically recompiled on file changes.
echo Press Ctrl+C to stop watching.
echo.

cd /d "%~dp0extension"

REM Ensure dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies first...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

echo Starting watch mode...
echo.
call npm run watch
