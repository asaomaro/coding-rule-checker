@echo off
REM ========================================
REM Coding Rule Checker VSIX Build Script
REM ========================================

echo.
echo ========================================
echo Building Coding Rule Checker Extension
echo ========================================
echo.

REM Change to extension directory
cd /d "%~dp0extension"

REM Check if node_modules exists
if not exist "node_modules" (
    echo [1/3] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
    echo Dependencies installed successfully.
) else (
    echo [1/3] Dependencies already installed. Skipping...
)

echo.
echo [2/3] Compiling TypeScript...
call npm run compile
if errorlevel 1 (
    echo ERROR: TypeScript compilation failed
    pause
    exit /b 1
)
echo Compilation completed successfully.

echo.
echo [3/3] Packaging VSIX...
call npm run package
if errorlevel 1 (
    echo ERROR: VSIX packaging failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo BUILD COMPLETED SUCCESSFULLY!
echo ========================================
echo.

REM Find and display the generated VSIX file
for %%f in (*.vsix) do (
    echo VSIX file created: %%f
    echo Location: %CD%\%%f
)

echo.
echo You can now install the extension:
echo 1. Open VSCode
echo 2. Go to Extensions view (Ctrl+Shift+X)
echo 3. Click "..." menu and select "Install from VSIX..."
echo 4. Select the .vsix file
echo.

pause
