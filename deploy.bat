@echo off
title Deploy to wevois-vts-fleet
cd /d "%~dp0"

echo ===============================================================
echo 1. Google Login (Please select: krishnaravtani.wevois@gmail.com)
echo ===============================================================
call npx firebase login:use krishnaravtani.wevois@gmail.com || call npx firebase login:add

echo.
echo ===============================================================
echo 2. Building fresh files and Deploying to wevois-vts-fleet ...
echo ===============================================================
call npm run build
call npx firebase deploy --only hosting

echo.
echo ===============================================================
echo [SUCCESS] Deployed successfully to https://wevois-vts-fleet.web.app/
echo ===============================================================
pause
