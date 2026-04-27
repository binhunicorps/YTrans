@echo off
chcp 65001 > nul
title YTrans Updater
echo ================================================
echo   YTrans - Cap nhat phien ban moi tu GitHub
echo ================================================
echo.

cd /d "%~dp0"

echo [1/2] Dang tai code moi nhat tu GitHub...
git pull origin main
if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [LOI] Git pull that bai. Kiem tra ket noi mang.
  pause
  exit /b 1
)

echo.
echo [2/2] Hoan tat! Mo chrome://extensions de Reload extension...
echo.
echo  - Vao chrome://extensions
echo  - Tim "YTrans" va nhan nut Reload (bieu tuong mui ten xoay)
echo.

start chrome "chrome://extensions"
pause
