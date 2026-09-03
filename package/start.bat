@echo off
title BIGJOE Business AI
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed.
  echo Install the current LTS version of Node.js, then run this file again.
  echo.
  pause
  exit /b 1
)
if not exist ".env" copy ".env.example" ".env" >nul
echo Starting BIGJOE...
node server.js
pause
