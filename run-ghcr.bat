@echo off
:: Thin wrapper — forwards to run-ghcr.ps1 (prebuilt GHCR stack)
:: Usage:  run-ghcr.bat [up|down|status|logs|check|help] [-Gpu] [-Version <tag>]
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0run-ghcr.ps1" %*
