@echo off
REM ========================================
REM Run ESLint
REM ========================================

echo.
echo ========================================
echo Running ESLint
echo ========================================
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

echo Running lint check...
call npm run lint
if errorlevel 1 (
    echo.
    echo WARNING: Linting found issues.
    echo Please review and fix the issues above.
) else (
    echo.
    echo ========================================
    echo LINT CHECK PASSED!
    echo ========================================
)

echo.
pause
