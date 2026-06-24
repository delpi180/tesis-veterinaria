@echo off
title Iniciar Proyecto - Veterinaria Los Pinos
echo ============================================================
echo      INICIANDO PROYECTO: VETERINARIA LOS PINOS - 2026
echo ============================================================
echo.

echo [1/2] Iniciando backend (FastAPI) en puerto 8000...
start "Backend - FastAPI" cmd /k "cd backend && .\venv\Scripts\activate && uvicorn main:app --reload"

echo [2/2] Iniciando frontend (Vite + React) en puerto 5173...
start "Frontend - Vite/React" cmd /k "cd frontend && npm run dev"

echo.
echo ============================================================
echo  PROCESOS LANZADOS CON EXITO
echo  - Backend: http://localhost:8000/docs
echo  - Frontend: http://localhost:5173
echo ============================================================
echo.
pause
