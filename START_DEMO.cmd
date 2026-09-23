@echo off
cd /d "%~dp0"
title HUIT - Apache Mahout Visual Algorithm Demo
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-demo.ps1"
echo.
echo Demo da dung. Nhan phim bat ky de dong cua so.
pause >nul
