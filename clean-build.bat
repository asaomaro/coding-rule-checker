@echo off
REM ========================================
REM Clean Build Script
REM ========================================

echo.
echo ========================================
echo Clean Build - Coding Rule Checker
echo ========================================
echo.

cd /d "%~dp0extension"

echo [1/4] Cleaning dist directory...
if exist "dist" (
    rmdir /s /q dist
    echo Dist directory cleaned.
) else (
    echo Dist directory does not exist. Skipping...
)

echo.
echo [2/4] Cleaning node_modules...
if exist "node_modules" (
    rmdir /s /q node_modules
    echo Node_modules cleaned.
) else (
    echo Node_modules does not exist. Skipping...
)

echo.
echo [3/4] Installing fresh dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)
echo Dependencies installed successfully.

echo.
echo [4/4] Compiling TypeScript...
call npm run compile
if errorlevel 1 (
    echo ERROR: TypeScript compilation failed
    pause
    exit /b 1
)
echo Compilation completed successfully.

echo.
echo ========================================
echo CLEAN BUILD COMPLETED!
echo ========================================
echo.

pause
