@echo off
REM ========================================
REM Generate PNG Icon from SVG
REM ========================================

echo.
echo ========================================
echo Icon Generator
echo ========================================
echo.
echo Opening icon converter in your browser...
echo.
echo Instructions:
echo 1. Click "Download 128x128 PNG" button
echo 2. Save the file as "icon.png" in the extension folder
echo 3. Close the browser window when done
echo.

cd /d "%~dp0"

REM Open the HTML converter in default browser
start convert-icon.html

echo.
echo Browser should open automatically.
echo If not, manually open: convert-icon.html
echo.

pause
