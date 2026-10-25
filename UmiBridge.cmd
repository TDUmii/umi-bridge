@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title UmiBridge Sakura Console
start "" powershell.exe -NoProfile -STA -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0scripts\windows\UmiBridge-Tray.ps1" %*
endlocal
