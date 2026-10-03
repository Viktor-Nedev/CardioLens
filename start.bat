@echo off
rem Double-click to start CardioLens (sets everything up on first run).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" %*
