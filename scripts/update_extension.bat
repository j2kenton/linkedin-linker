@echo off
cd /d "C:\dev\PERSONAL\linkedin-linker"
echo Checking for LinkedIn extension updates...

git pull origin master

if %errorlevel% equ 0 (
    echo.
    echo ✅ Extension updated successfully!
    echo Please reload the extension in Chrome extensions page.
    start chrome://extensions/
) else (
    echo.
    echo ❌ Update failed or no updates available.
)

echo.
echo Press any key to continue...
pause > nul
