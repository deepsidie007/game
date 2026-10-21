@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 梗王擂台 - 联机试玩
where node >nul 2>nul
if errorlevel 1 (
 echo 请先安装 Node.js LTS，然后重新打开本文件。
 echo 官方下载地址：https://nodejs.org/
 start "" "https://nodejs.org/"
 pause
 exit /b 1
)
node start-share.mjs
echo.
echo 游戏已停止。如果启动失败，请截图上方提示。
pause
