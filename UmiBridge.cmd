@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
title UmiBridge Sakura Console
start "" wscript.exe //B //Nologo "%~dp0scripts\windows\UmiBridge-Launch.vbs" %*
endlocal
