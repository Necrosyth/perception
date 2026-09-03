@echo off
:: Thin wrapper — forwards to run.ps1
:: Usage:  run.bat [up|down|logs|status|check|help] [-Json] [extra args...]
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0run.ps1" %*
